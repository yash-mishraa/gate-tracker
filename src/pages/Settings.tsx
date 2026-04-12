import { exportDB, importInto } from 'dexie-export-import';
import { db } from '../db';
import { Card, Button } from '../components/ui';
import { Download, Upload } from 'lucide-react';
import { useRef } from 'react';

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const blob = await exportDB(db, { prettyJson: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gate-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export database.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm('This will append to your current data and potentially overwrite duplicate IDs. Continue?')) {
      try {
        await importInto(db, file, { clearTablesBeforeImport: false });
        alert('Data imported successfully!');
        window.location.reload(); // Quick refresh to update state
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import data. Make sure it is a valid backup JSON.');
      }
    }
    
    // reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Settings & Data</h1>
        <p className="text-secondary">Manage your persistent storage and backups.</p>
      </div>

      <Card>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 500 }}>Data Management</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '400px' }}>
          <div>
            <p className="text-secondary" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              Export all your topics, sessions, planner data, and PYQ progress as a JSON file.
            </p>
            <Button onClick={handleExport} style={{ width: '100%' }}>
              <Download size={18} /> Export Data (JSON)
            </Button>
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '0.5rem 0' }} />

          <div>
            <p className="text-secondary" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              Restore from a previously exported JSON backup file.
            </p>
            <input 
              type="file" 
              accept="application/json"
              style={{ display: 'none' }} 
              ref={fileInputRef}
              onChange={handleImport}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} style={{ width: '100%' }}>
              <Upload size={18} /> Import Data
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
