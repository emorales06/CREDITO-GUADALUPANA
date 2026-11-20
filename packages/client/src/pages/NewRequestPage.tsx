import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LOAN_TERMS,
  MAX_AMOUNT_TO_INCOME_PERCENT,
  buildAmortizationSchedule,
  createRequestSchema,
  documentIdSchema,
  formatUSD,
  maxAmountForIncome,
  toCents,
  type LoanTerm,
} from '@guadalupana/shared';
import { useCreateRequest, useEligibility } from '../api/hooks.ts';
import { ApiError } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { AmortizationSummary, AmortizationTable } from '../components/AmortizationTable.tsx';
import { Banner, Icon, Segmented, Spinner, useToast } from '../components/ui.tsx';

interface FormState {
  applicantName: string;
  documentId: string;
  monthlyIncome: string;
  amount: string;
  termMonths: LoanTerm;
}

type Field = keyof FormState;

const toNumber = (raw: string): number => (raw.trim() === '' ? Number.NaN : Number(raw.replace(/,/g, '')));

export function NewRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateRequest();

  const [form, setForm] = useState<FormState>({
    applicantName: user?.fullName ?? '',
    documentId: '',
    monthlyIncome: '',
    amount: '',
    termMonths: 12,
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverFields, setServerFields] = useState<Record<string, string[]>>({});

  const candidate = {
    applicantName: form.applicantName,
    documentId: form.documentId,
    monthlyIncome: toNumber(form.monthlyIncome),
    amount: toNumber(form.amount),
    termMonths: form.termMonths,
  };
  // Misma validación (esquema Zod compartido) que aplica el backend.
  const validation = createRequestSchema.safeParse(candidate);
  const clientErrors = useMemo(() => {
    const errors: Partial<Record<Field, string>> = {};
    if (!validation.success) {
      for (const issue of validation.error.issues) {
        const key = issue.path[0] as Field;
        errors[key] ??= issue.message;
      }
    }
    return errors;
  }, [validation]);
  const errorFor = (f: Field) => (touched[f] ? clientErrors[f] : undefined) ?? serverFields[f]?.[0];

  // Regla de historial: se consulta al servidor en cuanto el DPI es válido.
  const deferredDoc = useDeferredValue(form.documentId.trim());
  const docValid = documentIdSchema.safeParse(deferredDoc).success;
  const eligibility = useEligibility(docValid ? deferredDoc : null);
  const blocked = eligibility.data?.eligible === false;

  const amountCents = Number.isFinite(candidate.amount) && candidate.amount > 0 ? toCents(candidate.amount) : 0;
  const incomeCents = Number.isFinite(candidate.monthlyIncome) && candidate.monthlyIncome > 0 ? toCents(candidate.monthlyIncome) : 0;
  const deferredAmount = useDeferredValue(amountCents);
  const schedule = useMemo(() => buildAmortizationSchedule(deferredAmount, form.termMonths), [deferredAmount, form.termMonths]);

  const set = (field: Field) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setServerFields((s) => ({ ...s, [field]: [] }));
  };
  const touch = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ applicantName: true, documentId: true, monthlyIncome: true, amount: true, termMonths: true });
    if (!validation.success || blocked) return;
    create.mutate(validation.data, {
      onSuccess: (request) => {
        toast(`Solicitud #${request.id} registrada`, 'ok', 'Estamos consultando el buró crediticio.');
        navigate(`/solicitudes?id=${request.id}`);
      },
      onError: (err) => {
        if (err instanceof ApiError) setServerFields(err.fields);
      },
    });
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Solicitud de desembolso</span>
          <h1 className="large-title">Nueva solicitud</h1>
          <p>Complete los datos; la simulación financiera se actualiza mientras escribe.</p>
        </div>
      </div>

      <div className="split">
        <form className="card card-pad grid" onSubmit={onSubmit} noValidate style={{ gap: 20 }}>
          <div className="form-grid">
            <div className="form-section full"><span className="form-section__num">1</span> Datos del solicitante</div>
            <div className="field full">
              <label htmlFor="applicantName">Nombre del solicitante</label>
              <div className="input-wrap">
                <span className="lead-icon"><Icon name="user" size={18} /></span>
                <input id="applicantName" className="input" value={form.applicantName} autoComplete="name"
                  aria-invalid={errorFor('applicantName') ? true : undefined}
                  onChange={(e) => set('applicantName')(e.target.value)} onBlur={touch('applicantName')} />
              </div>
              {errorFor('applicantName') && <span className="error"><Icon name="alert" size={13} /> {errorFor('applicantName')}</span>}
            </div>

            <div className="field full">
              <label htmlFor="documentId">Documento de identidad (DPI)</label>
              <div className="input-wrap">
                <span className="lead-icon"><Icon name="file" size={18} /></span>
                <input id="documentId" className="input mono" value={form.documentId} inputMode="numeric" maxLength={13} placeholder="13 dígitos"
                  aria-invalid={errorFor('documentId') || blocked ? true : undefined}
                  data-valid={docValid && eligibility.data?.eligible ? true : undefined}
                  onChange={(e) => set('documentId')(e.target.value.replace(/\D/g, ''))} onBlur={touch('documentId')} />
              </div>
              {errorFor('documentId') && <span className="error"><Icon name="alert" size={13} /> {errorFor('documentId')}</span>}
              {docValid && eligibility.isFetching && <span className="hint"><Spinner size={12} /> Verificando historial del documento…</span>}
              {docValid && eligibility.data?.eligible && !eligibility.isFetching && <span className="hint hint--ok"><Icon name="check" size={13} strokeWidth={2.6} /> Sin solicitudes que bloqueen este documento</span>}
            </div>

            {blocked && (
              <div className="full">
                <Banner tone="error" title="No se puede registrar la solicitud">{eligibility.data?.reason}</Banner>
              </div>
            )}

            <div className="form-section full" style={{ marginTop: 6 }}><span className="form-section__num">2</span> Condiciones del crédito</div>
            <div className="field">
              <label htmlFor="monthlyIncome">Ingreso mensual declarado</label>
              <div className="input-wrap">
                <span className="prefix">$</span>
                <input id="monthlyIncome" className="input tabular" value={form.monthlyIncome} inputMode="decimal" placeholder="0.00"
                  aria-invalid={errorFor('monthlyIncome') ? true : undefined}
                  onChange={(e) => set('monthlyIncome')(e.target.value)} onBlur={touch('monthlyIncome')} />
              </div>
              {errorFor('monthlyIncome') && <span className="error"><Icon name="alert" size={13} /> {errorFor('monthlyIncome')}</span>}
            </div>

            <div className="field">
              <label htmlFor="amount">Monto solicitado</label>
              <div className="input-wrap">
                <span className="prefix">$</span>
                <input id="amount" className="input tabular" value={form.amount} inputMode="decimal" placeholder="0.00"
                  aria-invalid={errorFor('amount') ? true : undefined}
                  onChange={(e) => { set('amount')(e.target.value); touch('amount')(); }} onBlur={touch('amount')} />
              </div>
              {errorFor('amount')
                ? <span className="error"><Icon name="alert" size={13} /> {errorFor('amount')}</span>
                : incomeCents > 0 && <span className="hint">Máximo permitido: {formatUSD(maxAmountForIncome(incomeCents))} ({MAX_AMOUNT_TO_INCOME_PERCENT}% del ingreso)</span>}
            </div>

            <div className="field full">
              <label id="term-label">Plazo</label>
              <Segmented label="Plazo en meses" value={String(form.termMonths)}
                options={LOAN_TERMS.map((t) => ({ value: String(t), label: `${t} meses` }))}
                onChange={(v) => setForm((f) => ({ ...f, termMonths: Number(v) as LoanTerm }))} />
            </div>
          </div>

          {create.error && !(create.error instanceof ApiError && Object.keys(create.error.fields).length) && (
            <Banner tone="error" title="No se pudo registrar">{create.error.message}</Banner>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={create.isPending || blocked}>
            {create.isPending ? <Spinner /> : <Icon name="check" size={18} strokeWidth={2.4} />} Enviar solicitud
          </button>
          <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
            Al enviarla se consultará automáticamente el buró crediticio.
          </p>
        </form>

        <aside className="card sticky" aria-label="Simulación financiera">
          <div className="card-pad" style={{ paddingBottom: 16 }}>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="calc" size={14} /> Simulación financiera</div>
            <div className="title-2" style={{ margin: '4px 0 16px' }}>
              {amountCents > 0 ? `${formatUSD(amountCents)} a ${form.termMonths} meses` : 'Ingrese un monto para simular'}
            </div>
            <AmortizationSummary schedule={schedule} />
          </div>
          {schedule.rows.length > 0 && <AmortizationTable schedule={schedule} />}
        </aside>
      </div>
    </main>
  );
}
