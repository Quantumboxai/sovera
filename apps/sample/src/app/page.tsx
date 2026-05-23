'use client';

import { useEffect, useState } from 'react';
import { useSovera } from '@/lib/sovera';

interface Patient {
  id: string;
  full_name: string;
  dob: string | null;
  created_at: string;
}

export default function Home() {
  const dl = useSovera();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [name, setName] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 20));

  useEffect(() => {
    dl.auth.getUser().then(setUser);
  }, [dl]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await dl.from<Patient>('Patient').select('id', 'full_name', 'dob', 'created_at').order('created_at', { ascending: false }).limit(50);
      if (error) pushLog(`ERR ${error.message}`);
      else setPatients(data ?? []);
    })();

    const ch = dl.channel('app.patients');
    ch.on<Patient>('*', (e) => {
      pushLog(`realtime ${e.type} → ${e.row.full_name ?? e.row.id}`);
      if (e.type === 'insert') setPatients((p) => [e.row, ...p]);
      if (e.type === 'delete') setPatients((p) => p.filter((x) => x.id !== e.row.id));
    });
    ch.subscribe();
    return () => { ch.unsubscribe(); };
  }, [dl, user]);

  if (!user) {
    return (
      <main>
        <h1>Sovera sample</h1>
        <button onClick={async () => setUser(await dl.auth.signIn())}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Patients</h1>
        <div>
          <span style={{ marginRight: 12 }}>{user.username}</span>
          <button onClick={async () => { await dl.auth.signOut(); setUser(null); }}>Sign out</button>
        </div>
      </header>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await dl.from<Patient>('Patient').insert({ full_name: name });
          if (error) pushLog(`ERR ${error.message}`);
          else { pushLog(`created ${name}`); setName(''); }
        }}
        style={{ display: 'flex', gap: 8, margin: '1rem 0' }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required style={{ flex: 1, padding: 8 }} />
        <button type="submit">Add</button>
      </form>

      <ul>
        {patients.map((p) => (
          <li key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
            <strong>{p.full_name}</strong> <small style={{ color: '#666' }}>{p.id}</small>
          </li>
        ))}
      </ul>

      <h3>Realtime log</h3>
      <pre style={{ background: '#f4f4f4', padding: 8, fontSize: 12 }}>{log.join('\n')}</pre>
    </main>
  );
}
