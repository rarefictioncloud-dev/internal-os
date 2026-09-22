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
import Leaves from "../pages/Leaves";
import Team from "../pages/Team";
import Attendance from "../pages/Attendance";
import Notes from "../pages/Notes";
import Library from "../pages/Library";
import Profile from "../pages/Profile";
import Bills from "../pages/Bills";

// Department Performance
import HRPerformance from "../pages/HRPerformance";
import SalesPerformance from "../pages/SalesPerformance";
import ProductionPerformance from "../pages/ProductionPerformance";
import ITPortalAdminPerformance from "../pages/ITPortalAdminPerformance";
import ContentWriterPerformance from "../pages/ContentWriterPerformance";
import SocialMediaPerformance from "../pages/socialmedia";
import PostProductionPerformance from "../pages/postproduction";

// Games
import Games from "../pages/Games";
import Snake from "../pages/Snake";
import Memory from "../pages/Memory";
import PlatformAdventure from "../pages/PlatformAdventure";

import ProtectedRoute from "./ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>

        {/* =====================================================
            LOGIN
            ===================================================== */}

        <Route
          path="/login"
          element={<Login />}
        />

        {/* =====================================================
            DASHBOARD
            ===================================================== */}

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

        {/* =====================================================
            DEPARTMENT PERFORMANCE
            ===================================================== */}

        {/* HR Performance */}
        <Route
          path="/hr-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HRPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Sales Performance */}
        <Route
          path="/sales-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SalesPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Production Performance */}
        <Route
          path="/production-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProductionPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* IT / Portal Admin Performance */}
        <Route
          path="/it-portal-admin-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ITPortalAdminPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Content Writer Performance */}
        <Route
          path="/content-writer-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ContentWriterPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Social Media / Account Management Performance */}
        <Route
          path="/social-media-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SocialMediaPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Post Production Performance */}
        <Route
          path="/post-production-performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PostProductionPerformance />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            TASKS
            ===================================================== */}

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

        {/* =====================================================
            PERFORMANCE
            ===================================================== */}

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

        {/* =====================================================
            DELIVERABLES
            ===================================================== */}

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

        {/* Deliverable Workspace */}
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

        {/* =====================================================
            APPROVALS
            ===================================================== */}

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

        {/* =====================================================
            LEAVES
            ===================================================== */}

        <Route
          path="/leaves"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Leaves />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            ATTENDANCE
            ===================================================== */}

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

        {/* =====================================================
            NOTES
            ===================================================== */}

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

        {/* =====================================================
            CALENDAR
            ===================================================== */}

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

        {/* =====================================================
            CLIENTS
            ===================================================== */}

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

        {/* =====================================================
            MESSAGES
            ===================================================== */}

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

        {/* =====================================================
            TEAM
            ===================================================== */}

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

        {/* =====================================================
            PROFILE
            ===================================================== */}

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

        {/* =====================================================
            BILLS
            ===================================================== */}

        <Route
          path="/bills"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Bills />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            LIBRARY
            ===================================================== */}

        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Library />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            GAMES
            ===================================================== */}

        {/* Games Home */}
        <Route
          path="/games"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Games />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Snake */}
        <Route
          path="/games/snake"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Snake />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Memory */}
        <Route
          path="/games/memory"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Memory />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Platform Adventure */}
        <Route
          path="/games/platform"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PlatformAdventure />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* =====================================================
            UNKNOWN ROUTES
            ===================================================== */}

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;