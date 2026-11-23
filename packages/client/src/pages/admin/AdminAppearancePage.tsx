import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { DEFAULT_THEME, MAX_LOGO_BYTES, contrastRatio, themeSchema, type ThemeSettings } from '@guadalupana/shared';
import { useSaveTheme } from '../../api/admin.ts';
import { ApiError } from '../../api/client.ts';
import { firstErrors } from '../../components/auth.tsx';
import { Banner, ConfirmDialog, Icon, Segmented, Spinner, StatusBadge, useToast } from '../../components/ui.tsx';
import { applyTheme, useTheme } from '../../theme/ThemeProvider.tsx';

const PRESETS: ReadonlyArray<{ name: string; primary: string; accent: string }> = [
  { name: 'Guadalupana', primary: '#043262', accent: '#0d5aa8' },
  { name: 'Océano', primary: '#0b3d5c', accent: '#127a9e' },
  { name: 'Pizarra', primary: '#1f2a3a', accent: '#3f6587' },
  { name: 'Bosque', primary: '#163d33', accent: '#2a6f5d' },
];

/**
 * Editor del tema. Los cambios se ven en vivo solo en esta sesión; al guardar se validan en el
 * servidor (contraste, formato del logo) y se publican a todos los usuarios conectados.
 */
export function AdminAppearancePage() {
  const { theme } = useTheme();
  const toast = useToast();
  const save = useSaveTheme();
  const [draft, setDraft] = useState<ThemeSettings>(theme);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(theme);

  useEffect(() => { if (!dirty) setDraft(theme); }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vista previa en vivo: se aplica a toda la interfaz de esta sesión y se revierte al salir sin guardar.
  const savedRef = useRef(theme);
  savedRef.current = theme;
  useEffect(() => {
    const hex = /^#[0-9a-fA-F]{6}$/;
    if ([draft.primary, draft.accent, draft.background, draft.text].every((c) => hex.test(c))) applyTheme(draft);
  }, [draft]);
  useEffect(() => () => applyTheme(savedRef.current), []);

  const set = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const parsed = themeSchema.safeParse(draft);
  const clientErrors = parsed.success ? {} : firstErrors(z.flattenError(parsed.error).fieldErrors);
  const shownErrors = { ...clientErrors, ...errors };

  function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setErrors({ logoDataUrl: 'Use un archivo PNG, JPG o WEBP' });
    if (file.size > MAX_LOGO_BYTES) return setErrors({ logoDataUrl: 'El logo no puede superar 300 KB' });
    const reader = new FileReader();
    reader.onload = () => { setErrors({}); set('logoDataUrl', String(reader.result)); };
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: () => { setErrors({}); toast('Apariencia guardada', 'ok', 'Los usuarios conectados verán el cambio de inmediato.'); },
      onError: (err) => {
        if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(firstErrors(err.fields));
        toast('No se pudo guardar', 'error', err.message);
      },
    });
  }

  const contrast = contrastRatio(draft.primary, '#ffffff');

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Apariencia</h1>
          <p>Colores, logotipo, tipografía, botones y densidad. Lo que ve aquí es una vista previa; guarde para aplicarlo a todos.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-light" disabled={!dirty || save.isPending} onClick={() => { setDraft(theme); setErrors({}); }}>Descartar</button>
          <button type="button" className="btn btn-accent" disabled={!dirty || !parsed.success || save.isPending} onClick={submit}>
            {save.isPending && <Spinner />} Guardar cambios
          </button>
        </div>
      </div>

      <div className="appearance">
        <section className="card card-pad grid" style={{ gap: 22 }}>
          <Group title="Identidad">
            <div className="field">
              <label htmlFor="appName">Nombre del sistema</label>
              <input id="appName" className="input" value={draft.appName} maxLength={60} onChange={(e) => set('appName', e.target.value)} />
              {shownErrors.appName && <span className="error">{shownErrors.appName}</span>}
            </div>
            <div className="field">
              <span className="field__label">Logotipo</span>
              <div className="logo-drop">
                <span className="logo-drop__box"><img src={draft.logoDataUrl ?? '/logo.webp'} alt="Logo actual" /></span>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> Subir logo</button>
                    {draft.logoDataUrl && <button type="button" className="btn btn-plain btn-sm" onClick={() => set('logoDataUrl', null)}>Usar el oficial</button>}
                  </div>
                  <span className="hint">PNG, JPG o WEBP, máx. 300 KB. SVG no se acepta por seguridad.</span>
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} />
              </div>
              {shownErrors.logoDataUrl && <span className="error">{shownErrors.logoDataUrl}</span>}
            </div>
          </Group>

          <Group title="Colores">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.name} type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft((d) => ({ ...d, primary: p.primary, accent: p.accent }))}>
                  <span style={{ display: 'inline-flex' }} aria-hidden="true">
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: p.primary }} />
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: p.accent, marginLeft: 2 }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <ColorField id="primary" label="Principal" value={draft.primary} onChange={(v) => set('primary', v)} error={shownErrors.primary}
                hint={`Contraste con blanco: ${contrast.toFixed(1)}:1 (mín. 4.5)`} />
              <ColorField id="accent" label="Acento" value={draft.accent} onChange={(v) => set('accent', v)} error={shownErrors.accent} />
              <ColorField id="background" label="Fondo" value={draft.background} onChange={(v) => set('background', v)} error={shownErrors.background} />
              <ColorField id="text" label="Texto" value={draft.text} onChange={(v) => set('text', v)} error={shownErrors.text} />
            </div>
          </Group>

          <Group title="Forma y tamaño">
            <div className="field">
              <label htmlFor="radius">Redondeo de esquinas</label>
              <div className="range-row">
                <input id="radius" type="range" min={0} max={24} step={1} value={draft.radius} onChange={(e) => set('radius', Number(e.target.value))} />
                <output htmlFor="radius">{draft.radius} px</output>
              </div>
            </div>
            <div className="field">
              <label htmlFor="fontScale">Tamaño del texto</label>
              <div className="range-row">
                <input id="fontScale" type="range" min={0.875} max={1.2} step={0.025} value={draft.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))} />
                <output htmlFor="fontScale">{Math.round(draft.fontScale * 100)} %</output>
              </div>
            </div>
            <div className="field">
              <span className="field__label">Botones</span>
              <Segmented label="Forma de los botones" value={draft.buttonShape} onChange={(v) => set('buttonShape', v)}
                options={[{ value: 'redondeado', label: 'Redondeados' }, { value: 'pildora', label: 'Píldora' }, { value: 'recto', label: 'Rectos' }]} />
            </div>
            <div className="field">
              <span className="field__label">Densidad</span>
              <Segmented label="Densidad de la interfaz" value={draft.density} onChange={(v) => set('density', v)}
                options={[{ value: 'compacta', label: 'Compacta' }, { value: 'normal', label: 'Normal' }, { value: 'amplia', label: 'Amplia' }]} />
            </div>
            <div className="field">
              <span className="field__label">Encabezado</span>
              <Segmented label="Estilo del encabezado" value={draft.headerStyle} onChange={(v) => set('headerStyle', v)}
                options={[{ value: 'claro', label: 'Claro (como el sitio oficial)' }, { value: 'marca', label: 'Color de marca' }]} />
            </div>
          </Group>

          <button type="button" className="btn btn-plain" style={{ justifySelf: 'start', padding: 0 }} onClick={() => setConfirmReset(true)}>
            <Icon name="refresh" size={15} /> Restablecer la apariencia oficial
          </button>
        </section>

        <aside className="sticky grid" style={{ gap: 16 }} aria-label="Vista previa de componentes">
          <section className="card card-pad grid" style={{ gap: 14 }}>
            <h2 className="title-3">Vista previa</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary">Aprobar</button>
              <button type="button" className="btn btn-secondary">Rechazar</button>
              <button type="button" className="btn btn-tinted">Secundario</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status="CREADA" /><StatusBadge status="EN_REVISION" /><StatusBadge status="APROBADA" /><StatusBadge status="RECHAZADA" />
            </div>
            <Banner tone="info" title="Consulta al buró en curso">Así se ven las alertas informativas.</Banner>
            <div className="field">
              <label htmlFor="pv-input">Campo de texto</label>
              <input id="pv-input" className="input" placeholder="Ejemplo" />
            </div>
            <div className="summary" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="summary__hero"><div className="label">Cuota mensual</div><div className="summary__value">$183.36</div></div>
              <div><div className="label">Total a pagar</div><div className="summary__value">$2,200.32</div></div>
            </div>
          </section>
          {save.error && !(save.error instanceof ApiError && Object.keys(save.error.fields).length) && <Banner tone="error">{save.error.message}</Banner>}
          {dirty && <Banner tone="warn" title="Cambios sin guardar">La vista previa solo la ve usted hasta que guarde.</Banner>}
        </aside>
      </div>

      <ConfirmDialog open={confirmReset} title="¿Restablecer la apariencia?" icon="refresh" confirmLabel="Restablecer"
        message="Se restauran los colores, el logo y las medidas oficiales para todos los usuarios."
        busy={save.isPending} onCancel={() => setConfirmReset(false)}
        onConfirm={() => save.mutate('reset', {
          onSuccess: (t) => { setDraft(t ?? DEFAULT_THEME); setConfirmReset(false); toast('Apariencia oficial restablecida'); },
          onError: (err) => toast('No se pudo restablecer', 'error', err.message),
        })} />
    </main>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
      <legend className="form-section" style={{ marginBottom: 12 }}>{title}</legend>
      {children}
    </fieldset>
  );
}

function ColorField({ id, label, value, onChange, error, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string | undefined; hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        <input type="color" value={value} aria-label={`${label}: selector`} onChange={(e) => onChange(e.target.value)} />
        <input id={id} className="input mono" value={value} maxLength={7} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error ? <span className="error">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
