/**
 * Standardized API response types for KodaConnect
 */

import { NextResponse } from 'next/server';

export interface ApiErrorResponse {
  error: string;
  details?: string | string[];
  status?: number;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Helper to create error responses
 */
export function apiError(message: string, status: number = 400, details?: string): NextResponse {
  return NextResponse.json({ error: message, details }, { status });
}

/**
 * Helper to create success responses
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}
