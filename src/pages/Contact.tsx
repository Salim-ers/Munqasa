import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { Tag } from "../components/Tag/Tag";
import { TransitionLink } from "../components/TransitionLink/TransitionLink";
import { FORMULAS } from "../data/offer";
import { site } from "../data/site";
import { usePageReveals } from "../hooks/usePageReveals";
import {
  CONSULTATION_TYPES,
  LIMITS,
  NEEDS,
  validateContact,
  type ContactErrors,
  type ContactField,
  type Need,
} from "../lib/contact";
import { PageHero } from "../sections/shared/PageHero";
import "./Contact.css";

interface Values {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  consultationType: string;
  reference: string;
  deadline: string;
  needs: Need[];
  message: string;
  consent: boolean;
}

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Ordre de lecture du formulaire : le premier champ en erreur reçoit le focus. */
const FIELD_ORDER: ContactField[] = ["fullName", "company", "email", "phone", "consultationType", "reference", "deadline", "needs", "message", "consent"];

const NEXT_STEPS = [
  { title: "Lecture", text: "Nous prenons connaissance de la consultation, de son échéance et de votre besoin." },
  { title: "Échange", text: "Un échange pour préciser les documents disponibles et le périmètre de l’intervention." },
  { title: "Proposition", text: "Une proposition d’accompagnement adaptée au dossier et au calendrier." },
];

function today(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

interface FieldProps {
  id: string;
  num: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

function Field({ id, num, label, required, error, hint, className, children }: FieldProps) {
  return (
    <div className={["field", error ? "has-error" : "", className].filter(Boolean).join(" ")}>
      <label className="field__label" htmlFor={id}>
        <span className="label field__num">{num}</span>
        <span className="label">{label}</span>
        {required && (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function Contact() {
  const ref = usePageReveals();
  const uid = useId();
  const [params] = useSearchParams();
  const formula = FORMULAS.find((f) => f.slug === params.get("formule"));
  const startedAt = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const [values, setValues] = useState<Values>(() => ({
    fullName: "",
    company: "",
    email: "",
    phone: "",
    consultationType: "",
    reference: "",
    deadline: "",
    needs: formula ? [formula.need] : [],
    message: formula ? `Formule envisagée : ${formula.title}.\n` : "",
    consent: false,
  }));
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const id = (name: string) => `${uid}-${name}`;
  const describedBy = (name: ContactField, hint = false) =>
    errors[name] ? `${id(name)}-error` : hint ? `${id(name)}-hint` : undefined;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as ContactField]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const onText = (key: "fullName" | "company" | "email" | "phone" | "reference" | "deadline" | "message") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update(key, e.target.value);

  function toggleNeed(need: Need) {
    update("needs", values.needs.includes(need) ? values.needs.filter((n) => n !== need) : [...values.needs, need]);
  }

  function focusFirstError(errs: ContactErrors) {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "sending") return;
    const website = (new FormData(e.currentTarget).get("website") as string | null) ?? "";
    const result = validateContact({ ...values });
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(result.errors);
      return;
    }

    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, website, startedAt: startedAt.current }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: ContactErrors; error?: string };
      if (res.ok && body.ok) {
        setStatus({ kind: "sent" });
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      if (body.errors) {
        setErrors(body.errors);
        focusFirstError(body.errors);
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: body.error ?? "L’envoi n’a pas abouti. Réessayez dans un instant." });
    } catch {
      setStatus({ kind: "error", message: "Connexion impossible. Vérifiez votre réseau puis réessayez." });
    }
  }

  return (
    <div ref={ref}>
      <PageHero
        tag="Contact"
        sheet="Feuillet 05 / 05"
        surface="night"
        lines={["Votre prochaine", "soumission", <em key="c">commence ici.</em>]}
        intro="Présentez la consultation, son échéance et ce dont vous avez besoin. Quelques informations suffisent pour un premier échange."
        image="night-desk"
        imagePosition="45% 50%"
      />

      <section className="contact surface-ivory has-grain" data-surface="light" aria-labelledby="demande-title">
        <div className="contact__inner container">
          <div className="contact__main">
            {status.kind === "sent" ? (
              <div className="contact__done">
                <Tag dot>Demande transmise</Tag>
                <h2 ref={doneRef} tabIndex={-1} className="display-md" id="demande-title">
                  Merci. <em>Votre demande est enregistrée.</em>
                </h2>
                <p className="body-text">
                  Nous revenons vers vous pour échanger sur l’échéance, les documents disponibles et l’accompagnement adapté.
                </p>
                <TransitionLink to="/" className="cta cta--outline" data-cursor="cta">
                  <span className="cta__label">Retour à l’accueil</span>
                </TransitionLink>
              </div>
            ) : (
              <form ref={formRef} className="contact__form" noValidate onSubmit={onSubmit} aria-labelledby="demande-title">
                <header className="contact__form-head">
                  <span className="label">Formulaire · Demande d’accompagnement</span>
                  <span className="label contact__rev">Rev. A</span>
                </header>
                <h2 id="demande-title" className="visually-hidden">
                  Demande d’accompagnement
                </h2>
                {formula && (
                  <p className="contact__formula">
                    <span className="label">Formule</span> {formula.title}
                  </p>
                )}

                <div className="contact__grid">
                  <Field id={id("fullName")} num="A.01" label="Nom complet" required error={errors.fullName}>
                    <input
                      id={id("fullName")}
                      data-field="fullName"
                      className="input"
                      type="text"
                      autoComplete="name"
                      maxLength={LIMITS.fullName}
                      required
                      value={values.fullName}
                      onChange={onText("fullName")}
                      aria-invalid={!!errors.fullName}
                      aria-describedby={describedBy("fullName")}
                    />
                  </Field>

                  <Field id={id("company")} num="A.02" label="Entreprise" required error={errors.company}>
                    <input
                      id={id("company")}
                      data-field="company"
                      className="input"
                      type="text"
                      autoComplete="organization"
                      maxLength={LIMITS.company}
                      required
                      value={values.company}
                      onChange={onText("company")}
                      aria-invalid={!!errors.company}
                      aria-describedby={describedBy("company")}
                    />
                  </Field>

                  <Field id={id("email")} num="A.03" label="E-mail" required error={errors.email}>
                    <input
                      id={id("email")}
                      data-field="email"
                      className="input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={LIMITS.email}
                      required
                      value={values.email}
                      onChange={onText("email")}
                      aria-invalid={!!errors.email}
                      aria-describedby={describedBy("email")}
                    />
                  </Field>

                  <Field id={id("phone")} num="A.04" label="Téléphone" error={errors.phone}>
                    <input
                      id={id("phone")}
                      data-field="phone"
                      className="input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={LIMITS.phone}
                      value={values.phone}
                      onChange={onText("phone")}
                      aria-invalid={!!errors.phone}
                      aria-describedby={describedBy("phone")}
                    />
                  </Field>
                </div>

                <fieldset className={`field field--group${errors.consultationType ? " has-error" : ""}`} aria-describedby={describedBy("consultationType")}>
                  <legend className="field__label">
                    <span className="label field__num">A.05</span>
                    <span className="label">Type de consultation</span>
                    <span className="field__req" aria-hidden="true">
                      *
                    </span>
                  </legend>
                  <div className="chips">
                    {Object.entries(CONSULTATION_TYPES).map(([value, label], i) => (
                      <label key={value} className="chip">
                        <input
                          type="radio"
                          name="consultationType"
                          value={value}
                          data-field={i === 0 ? "consultationType" : undefined}
                          checked={values.consultationType === value}
                          onChange={() => update("consultationType", value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {errors.consultationType && (
                    <p className="field__error" id={`${id("consultationType")}-error`}>
                      {errors.consultationType}
                    </p>
                  )}
                </fieldset>

                <div className="contact__grid">
                  <Field id={id("reference")} num="A.06" label="Référence de la consultation" hint="Numéro de l’avis, si vous l’avez." error={errors.reference}>
                    <input
                      id={id("reference")}
                      data-field="reference"
                      className="input"
                      type="text"
                      maxLength={LIMITS.reference}
                      value={values.reference}
                      onChange={onText("reference")}
                      aria-describedby={describedBy("reference", true)}
                    />
                  </Field>

                  <Field id={id("deadline")} num="A.07" label="Date limite" error={errors.deadline}>
                    <input
                      id={id("deadline")}
                      data-field="deadline"
                      className="input"
                      type="date"
                      min={today()}
                      value={values.deadline}
                      onChange={onText("deadline")}
                      aria-invalid={!!errors.deadline}
                      aria-describedby={describedBy("deadline")}
                    />
                  </Field>
                </div>

                <fieldset className={`field field--group${errors.needs ? " has-error" : ""}`} aria-describedby={describedBy("needs")}>
                  <legend className="field__label">
                    <span className="label field__num">A.08</span>
                    <span className="label">Besoin</span>
                    <span className="field__req" aria-hidden="true">
                      *
                    </span>
                  </legend>
                  <div className="chips">
                    {(Object.entries(NEEDS) as [Need, string][]).map(([value, label], i) => (
                      <label key={value} className="chip chip--check">
                        <input
                          type="checkbox"
                          value={value}
                          data-field={i === 0 ? "needs" : undefined}
                          checked={values.needs.includes(value)}
                          onChange={() => toggleNeed(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {errors.needs && (
                    <p className="field__error" id={`${id("needs")}-error`}>
                      {errors.needs}
                    </p>
                  )}
                </fieldset>

                <Field id={id("message")} num="A.09" label="Message" hint="Contexte, pièces déjà disponibles, contraintes de calendrier…" error={errors.message}>
                  <textarea
                    id={id("message")}
                    data-field="message"
                    className="input input--area"
                    rows={6}
                    maxLength={LIMITS.message}
                    value={values.message}
                    onChange={onText("message")}
                    aria-describedby={describedBy("message", true)}
                  />
                </Field>

                {/* Champ piège : invisible pour les personnes, rempli par les robots. */}
                <div className="contact__hp" aria-hidden="true">
                  <label htmlFor={id("website")}>Site web</label>
                  <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <div className={`consent${errors.consent ? " has-error" : ""}`}>
                  <label className="consent__label">
                    <input
                      type="checkbox"
                      data-field="consent"
                      checked={values.consent}
                      onChange={(e) => update("consent", e.target.checked)}
                      aria-invalid={!!errors.consent}
                      aria-describedby={describedBy("consent")}
                    />
                    <span className="consent__box" aria-hidden="true" />
                    <span>
                      J’accepte que les informations saisies soient utilisées pour traiter ma demande, conformément à la{" "}
                      <TransitionLink to="/politique-confidentialite">politique de confidentialité</TransitionLink>.
                    </span>
                  </label>
                  {errors.consent && (
                    <p className="field__error" id={`${id("consent")}-error`}>
                      {errors.consent}
                    </p>
                  )}
                </div>

                {status.kind === "error" && (
                  <p className="contact__alert" role="alert">
                    {status.message}
                  </p>
                )}

                <div className="contact__submit">
                  <button type="submit" className="cta cta--solid" data-cursor="cta" disabled={status.kind === "sending"}>
                    <span className="cta__label">{status.kind === "sending" ? "Envoi en cours…" : "Envoyer la demande"}</span>
                    <span className="cta__icon" aria-hidden="true">
                      <ArrowUpRight size={16} strokeWidth={1.5} />
                    </span>
                  </button>
                  <p className="label label--muted">* Champs obligatoires</p>
                </div>
              </form>
            )}
          </div>

          <aside className="contact__aside" aria-label="Informations">
            <div className="contact__block">
              <h2 className="label contact__aside-title">Après votre demande</h2>
              <ol className="contact__steps">
                {NEXT_STEPS.map((s, i) => (
                  <li key={s.title}>
                    <span className="label contact__step-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="contact__step-title">{s.title}</p>
                      <p className="contact__step-text">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="contact__block contact__confidential">
              <h2 className="label contact__aside-title">Confidentialité</h2>
              <p>
                Ne joignez aucun document confidentiel à ce stade. Les pièces du dossier sont échangées ensuite, par un canal
                convenu ensemble.
              </p>
            </div>

            {(site.contact.email || site.contact.phone) && (
              <div className="contact__block">
                <h2 className="label contact__aside-title">Coordonnées</h2>
                {site.contact.email && <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>}
                {site.contact.phone && <a href={`tel:${site.contact.phone.replace(/\s/g, "")}`}>{site.contact.phone}</a>}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
