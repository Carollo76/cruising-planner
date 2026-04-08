import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ChartPage } from './features/route-planning/pages/ChartPage';
import { RouteListPage } from './features/route-planning/pages/RouteListPage';
import { RoutePlannerPage } from './features/route-planning/pages/RoutePlannerPage';
import { RouteDetailPage } from './features/route-planning/pages/RouteDetailPage';
import { TripListPage } from './features/route-planning/pages/TripListPage';
import { TripDetailPage } from './features/route-planning/pages/TripDetailPage';
import { TripEditPage } from './features/route-planning/pages/TripEditPage';
import { BoatConfigPage } from './features/route-planning/pages/BoatConfigPage';
import { MorePage } from './features/route-planning/pages/MorePage';
import { WeatherDashboard } from './features/weather/pages/WeatherDashboard';
import { TripAssessmentPage } from './features/weather/pages/TripAssessmentPage';
import { DestinationListPage } from './features/destinations/pages/DestinationListPage';
import { DestinationDetailPage } from './features/destinations/pages/DestinationDetailPage';
import { DestinationEditPage } from './features/destinations/pages/DestinationEditPage';
import { SafetyDashboard } from './features/safety/pages/SafetyDashboard';
import { MOBPage } from './features/safety/pages/MOBPage';
import { FloatPlanPage } from './features/safety/pages/FloatPlanPage';
import { ChecklistListPage } from './features/safety/pages/ChecklistListPage';
import { ChecklistRunnerPage } from './features/safety/pages/ChecklistRunnerPage';
import { ChecklistEditorPage } from './features/safety/pages/ChecklistEditorPage';
import { CrewListPage } from './features/crew/pages/CrewListPage';
import { WatchSchedulePage } from './features/watch-schedule/pages/WatchSchedulePage';
import { ProvisioningPage } from './features/provisioning/pages/ProvisioningPage';
import { LogbookPage } from './features/logbook/pages/LogbookPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChartPage />} />
        <Route path="routes" element={<RouteListPage />} />
        <Route path="routes/new" element={<RoutePlannerPage mode="create" />} />
        <Route path="routes/:id" element={<RouteDetailPage />} />
        <Route path="routes/:id/edit" element={<RoutePlannerPage mode="edit" />} />
        <Route path="trips" element={<TripListPage />} />
        <Route path="trips/new" element={<TripEditPage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route path="trips/:id/edit" element={<TripEditPage />} />
        <Route path="trips/:id/assess" element={<TripAssessmentPage />} />
        <Route path="weather" element={<WeatherDashboard />} />
        <Route path="destinations" element={<DestinationListPage />} />
        <Route path="destinations/new" element={<DestinationEditPage />} />
        <Route path="destinations/:id" element={<DestinationDetailPage />} />
        <Route path="destinations/:id/edit" element={<DestinationEditPage />} />
        <Route path="safety" element={<SafetyDashboard />} />
        <Route path="safety/checklists" element={<ChecklistListPage />} />
        <Route path="safety/checklists/new" element={<ChecklistEditorPage />} />
        <Route path="safety/checklists/:id/run" element={<ChecklistRunnerPage />} />
        <Route path="safety/checklists/:id/edit" element={<ChecklistEditorPage />} />
        <Route path="safety/float-plan" element={<FloatPlanPage />} />
        <Route path="safety/mob" element={<MOBPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="boat" element={<BoatConfigPage />} />
        <Route path="crew" element={<CrewListPage />} />
        <Route path="watch" element={<WatchSchedulePage />} />
        <Route path="provisioning" element={<ProvisioningPage />} />
        <Route path="logbook" element={<LogbookPage />} />
      </Route>
    </Routes>
  );
}
