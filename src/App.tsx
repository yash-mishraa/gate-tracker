import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Planner = React.lazy(() => import('./pages/Planner'));
const Subjects = React.lazy(() => import('./pages/Subjects'));
const PYQTracker = React.lazy(() => import('./pages/PYQTracker'));
const Timer = React.lazy(() => import('./pages/Timer'));
const Analytics = React.lazy(() => import('./pages/Analytics'));
const Notes = React.lazy(() => import('./pages/Notes'));
const Settings = React.lazy(() => import('./pages/Settings'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const Tests = React.lazy(() => import('./pages/Tests'));

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
          Something went wrong. Please refresh.
        </div>
      );
    }
    return this.props.children;
  }
}

const MinimalLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
    Loading...
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<MinimalLoader />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="calendar" element={<CalendarView />} />
              <Route path="planner" element={<Planner />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="pyq-tracker" element={<PYQTracker />} />
              <Route path="tests" element={<Tests />} />
              <Route path="timer" element={<Timer />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="notes" element={<Notes />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
