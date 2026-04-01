'use client';

import React, { useState, useMemo } from 'react';
import { AlertTriangle, Calendar, Bell, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContractRenewalAlertProps {
  listings: Array<{
    id: number;
    title: string;
    address: string;
    dong: string;
    deal: string;
    deposit: number;
    monthly?: number | null;
    status: string;
    contract_end_date?: string | null;
  }>;
}

// Color palette based on WISHES design
const COORSPà= {
  primary: '#1b5e20',
  secondary: '#66bb6a',
  accent: '#f9a825',
  urgent: '#ef5350',
  warning: '#f9a825',
  info: '#66bb6a',
};

// Type for categorized alerts
interface CategorizedAlert {
  id: number;
  title: string;
  address: string;
  dong: string;
  deal: string;
  deposit: number;
  monthly?: number | null;
  status: string;
  contract_end_date: string;
  daysRemaining: number;
  urgency: 'urgent' | 'warning' | 'info';
}

// Calculate days remaining until contract end date
const calculateDaysRemaining = (contractEndDate: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(contractEndDate);
  endDate.setHours(0, 0, 0, 0);

  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

// Determine urgency level based on days remaining
const getUrgency = (daysRemaining: number): 'urgent' | 'warning' | 'info' => {
  if (daysRemaining <= 30) return 'urgent';
  if (daysRemaining <= 90) return 'warning';
  return 'info';
};

// Get urgency color
const getUrgencyColor = (urgency: 'urgent' | 'warning' | 'info'): string => {
  switch (urgency) {
    case 'urgent':
      return COLORS.urgent;
    case 'warning':
      return COLORS.warning;
    case 'info':
      return COLORS.info;
  }
};

// Get urgency label
const getUrgencyLabel = (urgency: 'urgent' | 'warning' | 'info'): string => {
  switch (urgency) {
    case 'urgent':
      return '긴급';
    case 'warning':
      return '주의';
    case 'info':
      return '정보';
  }
};

// Alert Card Component
const AlertCard = ({ alert }: { alert: CategorizedAlert }) => {
  const urgencyColor = getUrgencyColor(alert.urgency);
  const urgencyLabel = getUrgencyLabel(alert.urgency);
  const dealType = alert.deal === '매매' ? '매매' : '전세/월세';
  const price = alert.deal === '매매' ? `${alert.deposit}만원` : `보증금 ${alert.deposit}만원${alert.monthly ? ` / 월 ${alert.monthly}만원` : ''}`;

  return (
    <div
      className="border-l-4 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
      style={{ borderLeftColor: urgencyColor }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Header with Title and Badge */}
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                {alert.title}
              </h4>
              <p className="text-xs text-gray-500 mt-1">{alert.address}</p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-white text-xs font-medium flex-shrink-0"
              style={{ backgroundColor: urgencyColor }}
            >
              {urgencyLabel}
            </span>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            {/* Contract End Date */}
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-500">계약 종료</p>
                <p className="text-gray-900 font-medium">
                  {new Date(alert.contract_end_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </p>
              </div>
            </div>

            {/* Days Remaining */}
            <div className="flex items-start gap-2">
              <Clock size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-500">남은 기간</p>
                <p className="text-gray-900 font-medium">
                  {alert.daysRemaining}일
                </p>
              </div>
            </div>

            {/* Price Info */}
            <div className="col-span-2 text-gray-700">
              <p className="text-xs text-gray-500">가격</p>
              <p className="text-xs font-medium text-gray-900 mt-0.5">{price}</p>
            </div>

            {/* Deal Type & Status */}
            <div className="text-gray-700">
              <p className="text-xs text-gray-500">거래</p>
              <p className="text-xs font-medium text-gray-900 mt-0.5">{dealType}</p>
            </div>
            <div className="text-gray-700">
              <p className="text-xs text-gray-500">상태</p>
              <p className="text-xs font-medium text-gray-900 mt-0.5">{alert.status}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={() => alert('준비 중입니다')}
        className="mt-3 w-full px-3 py-2 rounded-md text-sm font-medium text-white transition-colors"
        style={{
          backgroundColor: urgencyColor,
          opacity: 0.9,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.opacity = '0.9';
        }}
      >
        <Bell size={14} className="inline mr-2" />
        갱신 알림 보내기
      </button>
    </div>
  );
};

// Section Header Component
const SectionHeader = ({
  title,
  count,
  color,
  isExpanded,
  onToggle,
}: {
  title: string;
  count: number;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg font-semibold text-white transition-all hover:shadow-md"
      style={{ backgroundColor: color }}
    >
      <div className="flex items-center gap-2">
        {count > 0 ? (
          <>
            <AlertTriangle size={18} />
            <span>
              {title} ({count}개)
            </span>
          </>
        ) : (
          <span>{title}</span>
        )}
      </div>
      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
    </button>
  );
};

// Main Component
export const ContractRenewalAlert: React.FC<ContractRenewalAlertProps> = ({ listings }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    urgent: true,
    warning: true,
    info: false,
  });

  // Process and categorize alerts
  const categorizedAlerts = useMemo(() => {
    const urgent: CategorizedAlert[] = [];
    const warning: CategorizedAlert[] = [];
    const info: CategorizedAlert[] = [];

    listings.forEach((listing) => {
      if (listing.contract_end_date) {
        const daysRemaining = calculateDaysRemaining(listing.contract_end_date);

        // Only include future contract end dates (daysRemaining > 0)
        if (daysRemaining > 0) {
          const urgency = getUrgency(daysRemaining);
          const alert: CategorizedAlert = {
            ...listing,
            contract_end_date: listing.contract_end_date,
            daysRemaining,
            urgency,
          };

          if (urgency === 'urgent') {
            urgent.push(alert);
          } else if (urgency === 'warning') {
            warning.push(alert);
          } else {
            info.push(alert);
          }
        }
      }
    });

    // Sort by days remaining (ascending)
    const sortByDays = (a: CategorizedAlert, b: CategorizedAlert) =>
      a.daysRemaining - b.daysRemaining;

    return {
      urgent: urgent.sort(sortByDays),
      warning: warning.sort(sortByDays),
      info: info.sort(sortByDays),
    };
  }, [listings]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const hasAlerts =
    categorizedAlerts.urgent.length > 0 ||
    categorizedAlerts.warning.length > 0 ||
    categorizedAlerts.info.length > 0;

  // Empty state
  if (!hasAlerts) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <Bell size={40} className="mx-auto mb-3 text-gray-300" />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">
          갱신 예정 계약이 없습니다
        </h3>
        <p className="text-sm text-gray-500">
          계약 종료 예정 매물이 없어 한결 마음이 편하네요!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Urgent Section */}
      <div className="space-y-3">
        <SectionHeader
          title="긴급 갱신"
          count={categorizedAlerts.urgent.length}
          color={COLORS.urgent}
          isExpanded={expandedSections.urgent}
          onToggle={() => toggleSection('urgent')}
        />
        {expandedSections.urgent && categorizedAlerts.urgent.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-0">
            {categorizedAlerts.urgent.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>

      {/* Warning Section */}
      {categorizedAlerts.warning.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title="주의 갱신"
            count={categorizedAlerts.warning.length}
            color={COLORS.warning}
            isExpanded={expandedSections.warning}
            onToggle={() => toggleSection('warning')}
          />
          {expandedSections.warning && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-0">
              {categorizedAlerts.warning.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      {categorizedAlerts.info.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title="정보 갱신"
            count={categorizedAlerts.info.length}
            color={COLORS.info}
            isExpanded={expandedSections.info}
            onToggle={() => toggleSection('info')}
          />
          {expandedSections.info && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-0">
              {categorizedAlerts.info.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
