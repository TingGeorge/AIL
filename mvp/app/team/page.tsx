import type { Metadata } from 'next';
import TeamHub from './team-hub';

export const metadata: Metadata = {
  title: 'Team Hub｜ALL IN LIFE',
  description: '建立邀請制團隊、分享未定價意願活動，並查看真實承諾進度。',
};

export default function TeamPage() {
  return <TeamHub />;
}
