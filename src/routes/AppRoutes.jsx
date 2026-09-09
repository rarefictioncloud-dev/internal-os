import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import Clients from "../pages/Clients";
import Calendar from "../pages/Calendar";
import Deliverables from "../pages/Deliverables";
import DeliverableWorkspace from "../pages/DeliverableWorkspace";
import Messages from "../pages/Messages";
import Approvals from "../pages/Approvals";
import Performance from "../pages/Performance";
import Team from "../pages/Team";
import Attendance from "../pages/Attendance";
import Notes from "../pages/Notes";
import Profile from "../pages/Profile";

import ProtectedRoute from "./ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>

        {/* =========================
            PUBLIC ROUTES
        ========================= */}

        <Route
          path="/login"
          element={<Login />}
        />


        {/* =========================
            PROTECTED WORKSPACE
        ========================= */}

        {/* Dashboard */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            TASKS
        ========================= */}

        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Tasks />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            NOTES
        ========================= */}

        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Notes />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            PROFILE
        ========================= */}

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Profile />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            PERFORMANCE
        ========================= */}

        <Route
          path="/performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Performance />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            TEAM MANAGEMENT
        ========================= */}

        <Route
          path="/team"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Team />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            ATTENDANCE
        ========================= */}

        <Route
          path="/attendance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Attendance />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            PRODUCTION
        ========================= */}

        {/* Deliverables */}
        <Route
          path="/deliverables"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Deliverables />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* Individual Deliverable Workspace */}
        <Route
          path="/deliverables/:deliverableId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DeliverableWorkspace />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            APPROVALS
        ========================= */}

        <Route
          path="/approvals"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Approvals />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            CALENDAR
        ========================= */}

        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Calendar />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            CLIENTS
        ========================= */}

        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Clients />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            MESSAGES
        ========================= */}

        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Messages />
              </AppLayout>
            </ProtectedRoute>
          }
        />


        {/* =========================
            FALLBACK
        ========================= */}

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;