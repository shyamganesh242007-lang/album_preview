import React from 'react';
import { AlbumStatus, CorrectionStatus } from '@/types/album';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'draft' | 'in-review' | 'changes-requested' | 'approved' | 'open' | 'resolved' | 'neutral' | 'blue';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const styles: Record<string, string> = {
    draft: 'bg-slate-800/70 text-slate-300 border-slate-700/60',
    'in-review': 'bg-amber-950/40 text-amber-300 border-amber-800/40',
    'changes-requested': 'bg-rose-950/40 text-rose-300 border-rose-800/40',
    approved: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
    open: 'bg-amber-950/40 text-amber-300 border-amber-800/40',
    resolved: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
    neutral: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
    blue: 'bg-purple-950/50 text-purple-300 border-purple-800/40',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        styles[variant] || styles.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
};

export function getStatusBadgeVariant(status: AlbumStatus): BadgeProps['variant'] {
  switch (status) {
    case 'Draft':
      return 'draft';
    case 'In Review':
    case 'Changes In Progress':
    case 'Customer Reviews':
      return 'in-review';
    case 'Ready for Review':
      return 'blue';
    case 'Changes Requested':
      return 'changes-requested';
    case 'Approved':
      return 'approved';
    default:
      return 'neutral';
  }
}
