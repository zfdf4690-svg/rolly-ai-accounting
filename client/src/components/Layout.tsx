import { Outlet } from 'react-router-dom';
import BottomTabBar from '@/components/BottomTabBar';

export const Layout = () => {
  return (
    <div className="mx-auto flex h-[100dvh] max-w-[480px] flex-col overflow-hidden bg-[#FFF9F3]">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
};
