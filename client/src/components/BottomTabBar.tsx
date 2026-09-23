import { NavLink } from 'react-router-dom';
import { MessageCircle, Calendar, BarChart3, User } from 'lucide-react';

interface TabItem {
  path: string;
  label: string;
  icon: typeof MessageCircle;
}

const TABS: TabItem[] = [
  { path: '/', label: '首页', icon: MessageCircle },
  { path: '/calendar', label: '日历', icon: Calendar },
  { path: '/stats', label: '统计', icon: BarChart3 },
  { path: '/me', label: '我的', icon: User },
];

export default function BottomTabBar() {
  return (
    <nav className="shrink-0 border-t border-[#F0E6DD] bg-white/90 backdrop-blur-lg">
      <div className="flex items-center justify-around px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-all duration-200 ${
                  isActive
                    ? 'text-[#E89AAD]'
                    : 'text-[#B8A89A] hover:text-[#8B7B6D]'
                }`
              }
            >
              <Icon className="h-6 w-6" strokeWidth={2} />
              <span className="text-xs font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
