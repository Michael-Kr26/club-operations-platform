import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Dataset,
  InventoryItem,
  InventoryCategory,
  InventoryOverview,
} from '@cop/contracts';
import { operationsApi } from './api';
import '../reports/reports.css';
import './inventory.css';

const categories = [
  { key: 'shirts', label: 'Werkshirts' },
  { key: 'vests', label: 'Vesten' },
  { key: 'sweaters', label: 'Truien' },
  { key: 'bags', label: 'Tassen' },
  { key: 'merch', label: 'Merchandise' },
] as const;
const sizes = ['S', 'M', 'L', 'XL', 'XXL'] as const;
function InventoryEditor({
  value,
  onSave,
  busy,
}: {
  value: InventoryOverview;
  onSave: (items: InventoryItem[]) => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<InventoryItem[]>(value.items);
  const [dirty, setDirty] = useState(false);
  const [viewParams, setViewParams] = useSearchParams();
  const tab = viewParams.get('view') === 'merch' ? 'merch' : 'workwear';
  function setTab(next: 'workwear' | 'merch') {
    const updated = new URLSearchParams(viewParams);
    updated.set('view', next);
    setViewParams(updated, { replace: true });
  }
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(''),
    [color, setColor] = useState(''),
    [category, setCategory] = useState<InventoryCategory>('shirts'),
    [sized, setSized] = useState(true),
    [addError, setAddError] = useState('');
  function change(
    id: string,
    size: keyof InventoryItem['quantities'],
    text: string,
  ) {
    setDirty(true);
    setItems((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              quantities: {
                ...item.quantities,
                [size]: text === '' ? null : Number(text),
              },
            }
          : item,
      ),
    );
  }
  function startAdding() {
    setAdding(true);
    setName('');
    setColor('');
    setAddError('');
    setCategory(tab === 'merch' ? 'merch' : 'shirts');
    setSized(tab !== 'merch');
  }
  function add() {
    if (!name.trim()) {
      setAddError('Vul een artikelnaam in.');
      return;
    }
    const quantities = sized
      ? { S: null, M: null, L: null, XL: null, XXL: null }
      : { total: null };
    setItems((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        category,
        quantities,
        ...(category === 'merch' ? { color: color.trim() || null } : {}),
      },
    ]);
    setTab(category === 'merch' ? 'merch' : 'workwear');
    setDirty(true);
    setAdding(false);
  }
  return (
    <>
      <div className="inventory-toolbar">
        <div role="group" aria-label="Voorraadoverzicht">
          <button
            type="button"
            className="button"
            aria-pressed={tab === 'workwear'}
            onClick={() => setTab('workwear')}
          >
            Werkkleding
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={tab === 'merch'}
            onClick={() => setTab('merch')}
          >
            Merchandise
          </button>
        </div>
        {value.canWrite && (
          <button
            type="button"
            className="button button--primary"
            disabled={busy || adding}
            onClick={startAdding}
          >
            + Artikel toevoegen
          </button>
        )}
      </div>
      {adding && (
        <form
          className="inventory-add"
          aria-label="Artikel toevoegen"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <h2>Nieuw artikel</h2>
          <div className="inventory-add-fields">
            <label>
              Artikelnaam
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Categorie
              <select
                value={category}
                onChange={(event) => {
                  const next = event.target.value as InventoryCategory;
                  setCategory(next);
                  setSized(next !== 'merch' && next !== 'bags');
                }}
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Aantallen bijhouden
              <select
                value={sized ? 'sizes' : 'total'}
                onChange={(event) => setSized(event.target.value === 'sizes')}
              >
                <option value="sizes">Per maat: S t/m XXL</option>
                <option value="total">Eén totaal (zonder maat)</option>
              </select>
            </label>
            {category === 'merch' && (
              <label className="inventory-add-color">
                Kleur (optioneel)
                <input
                  maxLength={60}
                  placeholder="Bijvoorbeeld blauw of zwart/oranje"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
            )}
          </div>
          {addError && <p role="alert">{addError}</p>}
          <button type="submit" className="button button--primary">
            Artikel toevoegen aan overzicht
          </button>{' '}
          <button
            type="button"
            className="button"
            onClick={() => setAdding(false)}
          >
            Annuleren
          </button>
          <p>
            Nieuwe aantallen zijn onbekend totdat je ze invult. Bewaar daarna
            alles met Voorraad opslaan.
          </p>
        </form>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(items);
        }}
      >
        {categories
          .filter((c) =>
            tab === 'merch' ? c.key === 'merch' : c.key !== 'merch',
          )
          .map((c) => (
            <section
              key={c.key}
              className="inventory-category"
              aria-label={`${c.label} categorie`}
            >
              <h2>{c.label}</h2>
              {!items.some((item) => item.category === c.key) && (
                <div className="inventory-empty">
                  <p>Nog geen artikelen in {c.label.toLowerCase()}.</p>
                  {value.canWrite && (
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        startAdding();
                        setCategory(c.key);
                        setSized(c.key !== 'merch' && c.key !== 'bags');
                      }}
                    >
                      Artikel toevoegen
                    </button>
                  )}
                </div>
              )}
              <div className="inventory-grid">
                {items
                  .filter((item) => item.category === c.key)
                  .map((item) => {
                    const values = Object.values(item.quantities),
                      counted = values.filter(
                        (n): n is number => typeof n === 'number',
                      );
                    return (
                      <section
                        className="inventory-card"
                        key={item.id}
                        aria-label={item.name}
                      >
                        <header>
                          <h3>{item.name}</h3>
                          <span>
                            {counted.length
                              ? `${counted.reduce((sum, n) => sum + n, 0)} stuks${counted.length < values.length ? ' geteld' : ''}`
                              : 'Nog niet geteld'}
                          </span>
                        </header>
                        {item.category === 'merch' && (
                          <label className="inventory-color">
                            Kleur
                            <input
                              aria-label={`${item.name} kleur`}
                              maxLength={60}
                              value={item.color ?? ''}
                              placeholder="Nog geen kleur"
                              disabled={!value.canWrite || busy}
                              onChange={(event) => {
                                const next = event.target.value;
                                setDirty(true);
                                setItems((previous) =>
                                  previous.map((entry) =>
                                    entry.id === item.id
                                      ? { ...entry, color: next }
                                      : entry,
                                  ),
                                );
                              }}
                            />
                          </label>
                        )}
                        <div
                          className={`inventory-sizes ${'total' in item.quantities ? 'inventory-sizes--total' : ''}`}
                        >
                          {('total' in item.quantities
                            ? (['total'] as const)
                            : sizes
                          ).map((size) => (
                            <label key={size}>
                              <span>{size === 'total' ? 'Aantal' : size}</span>
                              <input
                                type="number"
                                min="0"
                                max="1000000"
                                step="1"
                                inputMode="numeric"
                                aria-label={`${item.name} ${size === 'total' ? 'aantal' : size}`}
                                value={item.quantities[size] ?? ''}
                                placeholder="Onbekend"
                                disabled={!value.canWrite || busy}
                                onChange={(event) =>
                                  change(item.id, size, event.target.value)
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </section>
                    );
                  })}
              </div>
            </section>
          ))}
        <div className="inventory-save">
          {value.canWrite ? (
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || !dirty || adding}
            >
              {busy ? 'Opslaan…' : 'Voorraad opslaan'}
            </button>
          ) : (
            <p>Je hebt alleen leesrechten.</p>
          )}
          <span>
            {dirty
              ? 'Je hebt niet-opgeslagen wijzigingen.'
              : 'De opgeslagen voorraad wordt getoond.'}
          </span>
        </div>
      </form>
    </>
  );
}

export function InventoryPage() {
  const { organizationSlug = 'sport-society' } = useParams();
  const [params, setParams] = useSearchParams();
  const dataset: Dataset = params.get('dataset') === 'demo' ? 'demo' : 'real';
  const root = `organizations/${encodeURIComponent(organizationSlug)}/operations/inventory`;
  const cache = useQueryClient();
  const queryKey = ['inventory', organizationSlug, dataset];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      operationsApi<InventoryOverview>(`${root}?dataset=${dataset}`),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function save(items: InventoryItem[]) {
    if (!query.data) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await operationsApi<InventoryOverview>(root, {
        dataset,
        version: query.data.version,
        items,
      });
      cache.setQueryData(queryKey, result);
      setMessage('Voorraad opgeslagen op dit apparaat.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="cop-reports inventory-page">
      <header className="inventory-heading">
        <div>
          <span className="page-heading__eyebrow">
            Materiaal & kleding · Centrale organisatievoorraad
          </span>
          <h1>Voorraadbeheer</h1>
          <p>Werkkleding en merchandise op één plek.</p>
        </div>
        <label>
          Gegevens{' '}
          <select
            aria-label="Gegevens"
            disabled={busy}
            value={dataset}
            onChange={(event) => {
              setParams({ dataset: event.target.value });
              setMessage('');
              setError('');
            }}
          >
            <option value="real">Werkelijk</option>
            <option value="demo">Demo</option>
          </select>
        </label>
      </header>
      <p className="inventory-note">
        Kledingmaten S t/m XXL. Leeg betekent nog niet geteld; vul 0 in als er
        niets op voorraad is. Deze voorraad is centraal en niet aan een club
        toegewezen.
      </p>
      {dataset === 'demo' && (
        <p className="inventory-note">
          Demo: wijzigingen staan los van de echte voorraad.
        </p>
      )}
      {query.isPending && <p role="status">Voorraad laden…</p>}
      {query.error && (
        <div role="alert">
          <p>{query.error.message}</p>
          <p>
            Centrale voorraad vereist organisatierechten.{' '}
            <Link
              to={`/organisaties/${encodeURIComponent(organizationSlug)}/instellingen`}
            >
              Naar instellingen
            </Link>
          </p>
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="button"
            onClick={() => {
              if (
                window.confirm(
                  'Opnieuw laden verwijdert je niet-opgeslagen wijzigingen. Doorgaan?',
                )
              ) {
                setError('');
                void query.refetch();
              }
            }}
          >
            Opgeslagen voorraad opnieuw laden
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {query.data && !query.error && (
        <>
          <InventoryEditor
            key={`${organizationSlug}:${dataset}:${query.data.version}`}
            value={query.data}
            onSave={(items) => void save(items)}
            busy={busy}
          />
          <p className="inventory-updated">
            {query.data.updatedAt
              ? `Laatst opgeslagen: ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(query.data.updatedAt))}`
              : 'Nog geen voorraad opgeslagen.'}
          </p>
        </>
      )}
    </main>
  );
}
