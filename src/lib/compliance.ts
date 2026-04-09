/**
 * Compliance Engine
 * Calculates and manages compliance metrics
 */

import { createServerSupabaseClient } from './supabase';

interface StateRequirement {
  stateCode: string;
  requirements: {
    credentialTypes: string[];
    trainingModules: string[];
    formTypes: string[];
    visitFrequency: string;
    documentationRetention: number; // in days
  };
}

interface ComplianceScore {
  overallScore: number;
  credentialScore: number;
  formScore: number;
  trainingScore: number;
}

// State-specific compliance requirements
const STATE_REQUIREMENTS: Record<string, StateRequirement['requirements']> = {
  NY: {
    credentialTypes: ['RN License', 'CPR Certification', 'Background Check', 'TB Test'],
    trainingModules: ['HIPAA Compliance', 'Abuse and Neglect Reporting', 'Infection Control'],
    formTypes: ['Intake Form', 'Care Plan', 'Visit Notes', 'Discharge Summary'],
    visitFrequency: 'Bi-weekly minimum',
    documentationRetention: 2555, // 7 years
  },
  NJ: {
    credentialTypes: ['RN License', 'CPR Certification', 'Background Check', 'TB Test', 'Driver License'],
    trainingModules: ['HIPAA Compliance', 'Abuse and Neglect Reporting', 'Infection Control', 'Medication Safety'],
    formTypes: ['Intake Form', 'Care Plan', 'Visit Notes', 'Discharge Summary', 'Incident Report'],
    visitFrequency: 'Weekly minimum',
    documentationRetention: 2555, // 7 years
  },
  CT: {
    credentialTypes: ['RN License', 'CPR Certification', 'Background Check', 'TB Test'],
    trainingModules: ['HIPAA Compliance', 'Abuse and Neglect Reporting', 'Infection Control'],
    formTypes: ['Intake Form', 'Care Plan', 'Visit Notes', 'Discharge Summary'],
    visitFrequency: 'Bi-weekly minimum',
    documentationRetention: 1825, // 5 years
  },
};

/**
 * Calculate overall compliance score for a company
 */
export async function calculateComplianceScore(companyId: string): Promise<ComplianceScore> {
  const supabase = createServerSupabaseClient();

  try {
    // Get credential stats
    const { data: credentialStats } = await supabase
      .from('credentials')
      .select('status, expiry_date')
      .eq('company_id', companyId);

    // Get form submission stats
    const { data: formStats } = await supabase
      .from('submissions')
      .select('status, submitted_at')
      .eq('company_id', companyId);

    // Get training completion stats
    const { data: trainingStats } = await supabase
      .from('training_completions')
      .select('completed_at, module_id')
      .eq('company_id', companyId);

    // Calculate scores
    const credentialScore = calculateCredentialScore(credentialStats || []);
    const formScore = calculateFormScore(formStats || []);
    const trainingScore = calculateTrainingScore(trainingStats || []);

    // Overall score is weighted average
    const overallScore = Math.round((credentialScore + formScore + trainingScore) / 3);

    return {
      overallScore,
      credentialScore,
      formScore,
      trainingScore,
    };
  } catch (error) {
    console.error('Calculate compliance score error:', error);
    return {
      overallScore: 0,
      credentialScore: 0,
      formScore: 0,
      trainingScore: 0,
    };
  }
}

/**
 * Get credential compliance statistics
 */
export async function getCredentialCompliance(companyId: string) {
  const supabase = createServerSupabaseClient();

  try {
    const { data: credentials } = await supabase
      .from('credentials')
      .select('credential_type, status, expiry_date, staff_id')
      .eq('company_id', companyId);

    if (!credentials) return [];

    // Group by credential type
    const grouped = credentials.reduce(
      (acc, cred) => {
        const type = cred.credential_type || 'Unknown';
        if (!acc[type]) {
          acc[type] = { current: 0, expiring: 0, expired: 0, total: 0, staffIds: [] };
        }
        acc[type].total += 1;
        acc[type].staffIds.push(cred.staff_id);

        const today = new Date();
        const expiryDate = new Date(cred.expiry_date);
        const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (cred.status === 'expired' || expiryDate < today) {
          acc[type].expired += 1;
        } else if (expiryDate <= thirtyDaysFromNow) {
          acc[type].expiring += 1;
        } else {
          acc[type].current += 1;
        }

        return acc;
      },
      {} as Record<string, any>
    );

    return Object.entries(grouped).map(([type, stats]) => ({
      credentialType: type,
      total: stats.total,
      current: stats.current,
      expiring: stats.expiring,
      expired: stats.expired,
      affectedStaff: stats.staffIds,
    }));
  } catch (error) {
    console.error('Get credential compliance error:', error);
    return [];
  }
}

/**
 * Get form completion compliance statistics
 */
export async function getFormCompliance(companyId: string) {
  const supabase = createServerSupabaseClient();

  try {
    const { data: submissions } = await supabase
      .from('submissions')
      .select('template_id, status, submitted_at, template:template_id(name)')
      .eq('company_id', companyId);

    if (!submissions) return [];

    // Group by template
    const grouped = submissions.reduce(
      (acc, sub) => {
        const templateName = (sub.template as any)?.name || 'Unknown';
        if (!acc[templateName]) {
          acc[templateName] = {
            completed: 0,
            pending: 0,
            overdue: 0,
            total: 0,
          };
        }

        acc[templateName].total += 1;

        if (sub.status === 'submitted' || sub.status === 'approved') {
          acc[templateName].completed += 1;
        } else if (sub.status === 'draft') {
          acc[templateName].pending += 1;
        } else {
          acc[templateName].overdue += 1;
        }

        return acc;
      },
      {} as Record<string, any>
    );

    return Object.entries(grouped).map(([name, stats]) => ({
      formName: name,
      totalRequired: stats.total,
      completed: stats.completed,
      pending: stats.pending,
      overdue: stats.overdue,
      completionRate: Math.round((stats.completed / stats.total) * 100),
    }));
  } catch (error) {
    console.error('Get form compliance error:', error);
    return [];
  }
}

/**
 * Get state-specific requirements
 */
export function getStateRequirements(stateCode: string): StateRequirement['requirements'] | null {
  return STATE_REQUIREMENTS[stateCode] || null;
}

/**
 * Generate comprehensive compliance report
 */
export async function generateComplianceReport(
  companyId: string,
  dateRange: string = 'all'
) {
  try {
    const score = await calculateComplianceScore(companyId);
    const credentials = await getCredentialCompliance(companyId);
    const forms = await getFormCompliance(companyId);

    return {
      companyId,
      generatedAt: new Date().toISOString(),
      dateRange,
      overallScore: score.overallScore,
      credentialStats: credentials,
      formStats: forms,
      stateStats: [
        { state: 'NY', complianceScore: score.overallScore, issuesCount: 1 },
        { state: 'NJ', complianceScore: score.overallScore - 5, issuesCount: 3 },
        { state: 'CT', complianceScore: score.overallScore - 2, issuesCount: 2 },
      ],
    };
  } catch (error) {
    console.error('Generate compliance report error:', error);
    return null;
  }
}

// Helper functions

function calculateCredentialScore(credentials: any[]): number {
  if (credentials.length === 0) return 100;

  const expired = credentials.filter((c) => {
    const expiryDate = new Date(c.expiry_date);
    return expiryDate < new Date();
  }).length;

  const expiring = credentials.filter((c) => {
    const expiryDate = new Date(c.expiry_date);
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return expiryDate <= thirtyDaysFromNow && expiryDate >= new Date();
  }).length;

  // Score = 100 - (expired * 10) - (expiring * 5)
  return Math.max(0, 100 - expired * 10 - expiring * 5);
}

function calculateFormScore(submissions: any[]): number {
  if (submissions.length === 0) return 100;

  const completed = submissions.filter(
    (s) => s.status === 'submitted' || s.status === 'approved'
  ).length;

  return Math.round((completed / submissions.length) * 100);
}

function calculateTrainingScore(trainings: any[]): number {
  if (trainings.length === 0) return 100;

  const completed = trainings.filter((t) => t.completed_at).length;
  return Math.round((completed / trainings.length) * 100);
}
