/**
 * Dashboard Statistics API
 * GET: Returns real dashboard stats from actual database tables
 * Queries: companies, office_users, form_definitions, form_packets, form_submissions
 *
 * RBAC: If x-user-email or x-user-id headers are provided, stats are scoped
 * to the caller's assigned companies. Super admins see everything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // ─── Identify caller for RBAC filtering ───────────────────
    const userEmail = request.headers.get('x-user-email') || '';
    const userId = request.headers.get('x-user-id') || '';
    let callerRole: string | null = null;
    let callerCompanyIds: string[] = [];
    let callerUserId: string | null = null;

    if (userEmail || userId) {
      const { data: callerUser } = userEmail
        ? await supabase.from('office_users').select('id, role').eq('email', userEmail).single()
        : await supabase.from('office_users').select('id, role').eq('id', userId).single();

      if (callerUser) {
        callerRole = callerUser.role;
        callerUserId = callerUser.id;

        if (callerRole !== 'super_admin') {
          // Fetch assigned companies
          const { data: assignments } = await supabase
            .from('user_company_assignments')
            .select('company_id')
            .eq('user_id', callerUser.id);
          callerCompanyIds = (assignments || []).map((a: any) => a.company_id);
        }
      }
    }

    const isScoped = callerRole !== null && callerRole !== 'super_admin' && callerCompanyIds.length > 0;

    // ─── Companies ──────────────────────────────────────────────
    const { data: companies, count: totalCompanies } = await supabase
      .from('companies')
      .select('id, name, active, created_at', { count: 'exact' });

    const filteredCompanies = isScoped
      ? (companies || []).filter((c: any) => callerCompanyIds.includes(c.id))
      : (companies || []);
    const activeCompanies = filteredCompanies.filter((c: any) => c.active).length;

    // ─── Office Users ───────────────────────────────────────────
    const { data: officeUsers, count: totalUsers } = await supabase
      .from('office_users')
      .select('id, name, email, role, active, company_id, created_at', { count: 'exact' });

    // For scoped users, also fetch all user_company_assignments to filter users by shared companies
    let filteredUsers = officeUsers || [];
    if (isScoped) {
      const { data: allAssignments } = await supabase
        .from('user_company_assignments')
        .select('user_id, company_id');

      const userCompanyMap: Record<string, string[]> = {};
      (allAssignments || []).forEach((a: any) => {
        if (!userCompanyMap[a.user_id]) userCompanyMap[a.user_id] = [];
        userCompanyMap[a.user_id].push(a.company_id);
      });

      filteredUsers = (officeUsers || []).filter((u: any) => {
        // Never show super_admins to non-super_admins
        if (u.role === 'super_admin') return false;
        // Always show self
        if (u.id === callerUserId) return true;
        // Check if user shares a company
        const theirCompanies = userCompanyMap[u.id] || [];
        return theirCompanies.some((cid: string) => callerCompanyIds.includes(cid));
      });
    }
    const activeUsers = filteredUsers.filter((u: any) => u.active).length;

    // ─── Form Definitions ───────────────────────────────────────
    const { data: formDefs, count: totalForms } = await supabase
      .from('form_definitions')
      .select('form_id, form_name, status, company_id, created_at, updated_at', { count: 'exact' });

    const filteredForms = isScoped
      ? (formDefs || []).filter((f: any) => callerCompanyIds.includes(f.company_id))
      : (formDefs || []);
    const publishedForms = filteredForms.filter((f: any) => f.status === 'published').length;
    const draftForms = filteredForms.filter((f: any) => f.status === 'draft').length;

    // ─── Form Packets ───────────────────────────────────────────
    const { data: packets, count: totalPackets } = await supabase
      .from('form_packets')
      .select('id, packet_name, status, company_id, created_at', { count: 'exact' });

    const filteredPackets = isScoped
      ? (packets || []).filter((p: any) => callerCompanyIds.includes(p.company_id))
      : (packets || []);
    const publishedPackets = filteredPackets.filter((p: any) => p.status === 'published').length;

    // ─── Form Submissions ───────────────────────────────────────
    const { data: submissions, count: totalSubmissions } = await supabase
      .from('form_submissions')
      .select('id, status, form_id, company_id, created_at, submitted_at', { count: 'exact' });

    const filteredSubmissions = isScoped
      ? (submissions || []).filter((s: any) => callerCompanyIds.includes(s.company_id))
      : (submissions || []);

    const submissionsByStatus: Record<string, number> = {};
    filteredSubmissions.forEach((s: any) => {
      const status = s.status || 'unknown';
      submissionsByStatus[status] = (submissionsByStatus[status] || 0) + 1;
    });

    // Submissions this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const submissionsThisMonth = filteredSubmissions.filter(
      (s: any) => new Date(s.created_at) >= startOfMonth
    ).length;

    // ─── Recent Form Definitions (latest activity) ──────────────
    const recentForms = filteredForms
      .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 5)
      .map((f: any) => ({
        id: f.form_id,
        name: f.form_name,
        status: f.status,
        company_id: f.company_id,
        updated_at: f.updated_at || f.created_at,
      }));

    // ─── Recent Submissions ─────────────────────────────────────
    const recentSubmissions = filteredSubmissions
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        form_id: s.form_id,
        status: s.status,
        created_at: s.created_at,
        submitted_at: s.submitted_at,
      }));

    // ─── Forms per Company ──────────────────────────────────────
    const formsPerCompany: Record<string, number> = {};
    filteredForms.forEach((f: any) => {
      if (f.company_id) {
        formsPerCompany[f.company_id] = (formsPerCompany[f.company_id] || 0) + 1;
      }
    });

    const companyBreakdown = filteredCompanies
      .filter((c: any) => c.active)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        form_count: formsPerCompany[c.id] || 0,
        user_count: filteredUsers.filter((u: any) => u.company_id === c.id && u.active).length,
      }))
      .sort((a: any, b: any) => b.form_count - a.form_count);

    // ─── Recent Activity (from audit log or synthesized) ────────
    let recentActivity: any[] = [];

    const { data: auditData } = await supabase
      .from('submission_audit_log')
      .select('id, action, field_name, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(10);

    if (auditData && auditData.length > 0) {
      recentActivity = auditData.map((a: any) => ({
        id: a.id,
        type: a.action,
        description: a.field_name
          ? `${a.action}: ${a.field_name}`
          : a.action,
        timestamp: a.created_at,
      }));
    } else {
      // Synthesize from recent submissions + form updates
      const combined = [
        ...recentForms.map((f: any) => ({
          id: f.id,
          type: 'form_updated',
          description: `Form "${f.name}" (${f.status})`,
          timestamp: f.updated_at,
        })),
        ...recentSubmissions.map((s: any) => ({
          id: s.id,
          type: 'submission_' + (s.status || 'created'),
          description: `Submission ${s.status || 'created'}`,
          timestamp: s.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      recentActivity = combined;
    }

    // ─── Build Response ─────────────────────────────────────────
    const stats = {
      // Top-level counts
      companies: {
        total: isScoped ? filteredCompanies.length : (totalCompanies || 0),
        active: activeCompanies,
      },
      users: {
        total: isScoped ? filteredUsers.length : (totalUsers || 0),
        active: activeUsers,
        by_role: {
          super_admin: filteredUsers.filter((u: any) => u.role === 'super_admin').length,
          admin: filteredUsers.filter((u: any) => u.role === 'admin').length,
          staff: filteredUsers.filter((u: any) => u.role === 'staff').length,
        },
      },
      forms: {
        total: isScoped ? filteredForms.length : (totalForms || 0),
        published: publishedForms,
        draft: draftForms,
        archived: (isScoped ? filteredForms.length : (totalForms || 0)) - publishedForms - draftForms,
      },
      packets: {
        total: isScoped ? filteredPackets.length : (totalPackets || 0),
        published: publishedPackets,
      },
      submissions: {
        total: isScoped ? filteredSubmissions.length : (totalSubmissions || 0),
        this_month: submissionsThisMonth,
        by_status: submissionsByStatus,
      },
      // Breakdowns
      company_breakdown: companyBreakdown,
      // Recent items
      recent_forms: recentForms,
      recent_submissions: recentSubmissions,
      recent_activity: recentActivity,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
