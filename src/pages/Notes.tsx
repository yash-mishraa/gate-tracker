import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Card, Button, Input, Select } from '../components/ui';
import { Save, Trash2 } from 'lucide-react';

export default function Notes() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const notes = useLiveQuery(
    () => {
      if (selectedSubjectId === '') return db.notes.toArray();
      return db.notes.where('subjectId').equals(Number(selectedSubjectId)).toArray();
    },
    [selectedSubjectId]
  ) || [];

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || selectedSubjectId === '') return;
    
    await db.notes.add({
      subjectId: Number(selectedSubjectId),
      content: `${title}\n\n${content}`,
      lastUpdated: Date.now()
    });
    
    setTitle('');
    setContent('');
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await db.notes.delete(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem' }}>Revision Notes</h1>
          <p className="text-secondary">Quick notes and formulas mapped to subjects.</p>
        </div>
        
        <Select 
          value={selectedSubjectId} 
          onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : '')}
          style={{ width: '250px' }}
        >
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      <Card>
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Create New Note</h3>
        <form onSubmit={handleSaveNote} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Input 
              placeholder="Note Title (e.g. Master Theorem)" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            {selectedSubjectId === '' && (
              <Select 
                value={selectedSubjectId} 
                onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : '')}
                required
              >
                <option value="">Link to Subject...</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </div>
          
          <textarea 
            className="ui-input"
            rows={5}
            placeholder="Write your note down..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            style={{ resize: 'vertical' }}
          />
          
          <div style={{ alignSelf: 'flex-end' }}>
            <Button type="submit">
              <Save size={16} /> Save Note
            </Button>
          </div>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {notes.map(note => {
          const lines = note.content.split('\n');
          const noteTitle = lines[0];
          const noteBody = lines.slice(2).join('\n');
          const subject = subjects.find(s => s.id === note.subjectId);
          
          return (
            <Card key={note.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem' }}>{noteTitle}</h3>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {subject?.name} • {new Date(note.lastUpdated).toLocaleDateString()}
                  </div>
                </div>
                <Button variant="ghost" style={{ color: 'var(--danger-color)', padding: '0.3rem' }} onClick={() => handleDelete(note.id)}>
                  <Trash2 size={16} />
                </Button>
              </div>
              <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                {noteBody}
              </div>
            </Card>
          );
        })}
        {notes.length === 0 && (
          <div className="text-muted" style={{ padding: '2rem 0', gridColumn: '1 / -1', textAlign: 'center' }}>
            No notes found.
          </div>
        )}
      </div>
    </div>
  );
}
