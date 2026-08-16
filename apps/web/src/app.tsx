import { Route, Routes } from "react-router";
import { AirportPage, SearchPage } from "./features/airports/index.js";
import { AppShell } from "./shared/components/layout/app-shell.js";
import { LandingPage } from "./shared/pages/landing-page.js";
import { NotFoundPage } from "./shared/pages/not-found-page.js";

/** Rotas do contrato em contracts/ui-routes.md. Alterá-las quebra endereços compartilhados. */
export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/airports/:icao" element={<AirportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
