import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import ChatPage from "@/pages/ChatPage/ChatPage";
import CalendarPage from "@/pages/CalendarPage/CalendarPage";
import StatsPage from "@/pages/StatsPage/StatsPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import MePage from "@/pages/MePage/MePage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ChatPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="me" element={<MePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
