import DOMPurify from 'dompurify';
import { FormSection } from '@/lib/form-engine';

// ─── Types & Constants ──────────────────────────────────────────────────

export const MAX_ITEMS_PER_SCREEN = 6;

export interface TextParagraph {
  text: string;
  type: 'heading' | 'subheading' | 'section-title' | 'body' | 'list-item';
}

export interface ScreenContent {
  title?: TextParagraph;
  items: TextParagraph[];
}

interface ContentBlock {
  text: string;
  type: TextParagraph['type'];
  indent?: boolean;
}

// ─── HTML Content → Screens Parser ──────────────────────────────────────
// When no PDF is available but sections have HTML content, parse it into
// the same ScreenContent[] structure so the paginated UI works.
//
// Strategy: First flatten ALL HTML elements into typed blocks, then do
// a two-pass grouping:
//   Pass 1 — group blocks into "logical sections" (heading + its body)
//   Pass 2 — split any section that exceeds MAX_ITEMS_PER_SCREEN
//
// This avoids the problem of empty screens when consecutive headings
// appear (e.g. <h2>Title</h2><h3>Subtitle</h3><p>Doc number</p>).

export function parseHtmlToScreens(sections: FormSection[]): ScreenContent[] {
  const allScreens: ScreenContent[] = [];

  for (const section of sections) {
    if (!section.content) {
      if (section.title || section.description) {
        allScreens.push({
          title: { text: section.title || 'Information', type: 'heading' },
          items: section.description
            ? [{ text: section.description, type: 'body' }]
            : [],
        });
      }
      continue;
    }

    // ── Step 1: Flatten HTML into typed blocks ──
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(
      DOMPurify.sanitize(section.content),
      'text/html'
    );
    const blocks: ContentBlock[] = [];

    function walkElements(parent: Element) {
      for (const el of Array.from(parent.children)) {
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || '').trim();
        if (!text) continue;

        if (tag === 'h2') {
          blocks.push({ text, type: 'heading' });
        } else if (tag === 'h3') {
          blocks.push({ text, type: 'subheading' });
        } else if (tag === 'h4') {
          blocks.push({ text, type: 'section-title' });
        } else if (tag === 'ul' || tag === 'ol') {
          // Process list items, handling nesting
          for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
            const nestedLists = li.querySelectorAll(':scope > ul, :scope > ol');
            if (nestedLists.length > 0) {
              // Parent text only (exclude nested list text)
              const parentText = Array.from(li.childNodes)
                .filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !['UL', 'OL'].includes((n as Element).tagName)))
                .map((n) => (n.textContent || '').trim())
                .filter(Boolean)
                .join(' ');
              if (parentText) blocks.push({ text: parentText, type: 'list-item' });
              // Nested items
              for (const nested of Array.from(nestedLists)) {
                for (const subLi of Array.from(nested.querySelectorAll(':scope > li'))) {
                  const subText = (subLi.textContent || '').trim();
                  if (subText) blocks.push({ text: subText, type: 'list-item', indent: true });
                }
              }
            } else {
              const liText = (li.textContent || '').trim();
              if (liText) blocks.push({ text: liText, type: 'list-item' });
            }
          }
        } else {
          // <p>, <div>, etc. → body
          blocks.push({ text, type: 'body' });
        }
      }
    }
    walkElements(htmlDoc.body);

    if (blocks.length === 0) continue;

    // ── Step 2: Group into logical sections ──
    // A "logical section" starts at a heading and includes everything
    // until the next heading of equal or higher rank.
    // Consecutive headings are merged into one section's title.
    interface LogicalSection {
      titles: ContentBlock[];
      body: ContentBlock[];
    }
    const logicalSections: LogicalSection[] = [];

    function isHeading(b: ContentBlock) {
      return b.type === 'heading' || b.type === 'subheading' || b.type === 'section-title';
    }

    let curLogical: LogicalSection = { titles: [], body: [] };
    // Start with section.title as the implicit first heading
    curLogical.titles.push({ text: section.title || 'Policy', type: 'heading' });

    for (const block of blocks) {
      if (isHeading(block)) {
        if (curLogical.body.length > 0) {
          // Current section has body content → save it and start new
          logicalSections.push(curLogical);
          curLogical = { titles: [block], body: [] };
        } else {
          // No body yet — this heading follows another heading.
          // Merge into current section's titles.
          curLogical.titles.push(block);
        }
      } else {
        curLogical.body.push(block);
      }
    }
    // Push final section
    if (curLogical.titles.length > 0 || curLogical.body.length > 0) {
      logicalSections.push(curLogical);
    }

    // ── Step 3: Convert logical sections into screens ──
    // Each logical section becomes one or more screens.
    // If body exceeds MAX_ITEMS_PER_SCREEN, split into continuation screens.
    for (const ls of logicalSections) {
      // Build the title for this screen — use the highest-rank heading,
      // and demote remaining headings into body items
      const mainTitle = ls.titles[0];
      const extraTitles: ContentBlock[] = ls.titles.slice(1);

      // First screen for this logical section
      let screen: ScreenContent = {
        title: { text: mainTitle.text, type: mainTitle.type },
        items: [],
      };

      // Add extra titles as styled body items (bold subheadings within the card)
      for (const et of extraTitles) {
        screen.items.push({ text: et.text, type: et.type });
      }

      // Add body items, splitting when screen gets full
      for (const item of ls.body) {
        screen.items.push({
          text: item.indent ? '    ' + item.text : item.text,
          type: item.type,
        });

        if (screen.items.length >= MAX_ITEMS_PER_SCREEN) {
          allScreens.push(screen);
          // Continuation screen — no title (inherits context)
          screen = { items: [] };
        }
      }

      // Push remaining items
      if (screen.title || screen.items.length > 0) {
        allScreens.push(screen);
      }
    }
  }

  return allScreens;
}
