import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
