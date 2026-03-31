import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SocketProvider } from "./lib/socket.jsx";
import HomePage from "./pages/HomePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import RacePage from "./pages/RacePage.jsx";

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className="grid-bg" />
        <div className="scanlines" />
        {/* Ambient orbs */}
        <div className="orb" style={{ width: 500, height: 500, background: "rgba(0,229,255,0.04)", top: -100, left: -100 }} />
        <div className="orb" style={{ width: 400, height: 400, background: "rgba(224,64,251,0.04)", bottom: -100, right: -100 }} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/race/:roomId" element={<RacePage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}
