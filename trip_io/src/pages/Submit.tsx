import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ImagePlus, Send } from 'lucide-react'
import { CATEGORIES } from '@/data/categories'
import { useApp } from '@/store/AppContext'
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { PageHeader } from '@/components/layout/PageHeader'
import type { CategoryId, Submission, SubmissionStatus } from '@/types'

export function Submit() {
  const { t, language, addSubmission, requireAuth } = useApp()
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({
    name: '',
    category: '' as CategoryId | '',
    description: '',
    address: '',
    website: '',
    hours: '',
    price: '',
    contact: '',
  })

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!requireAuth()) return

    const submission: Submission = {
      id: `s-${Date.now()}`,
      ...form,
      photos: [],
      status: 'pending' as SubmissionStatus,
      submittedAt: new Date().toISOString(),
    }
    addSubmission(submission)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="px-5 py-8 lg:px-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <EmptyState
            icon={<Check className="h-5 w-5 text-emerald-400" />}
            title={language === 'fr' ? 'Proposition envoyée' : 'Submission received'}
            body={
              language === 'fr'
                ? 'Un modérateur la vérifiera avant publication. Vous la verrez dans « Mes propositions ».'
                : 'A moderator will check it before it appears. You can follow it under “My submissions”.'
            }
            action={
              <Link to="/app/submissions">
                <Button size="sm">{t('destSubmissions')}</Button>
              </Link>
            }
          />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader eyebrow={t('destSuggest')} title={t('submitTitle')} body={t('submitBody')} />

      <form onSubmit={submit} className="surface mt-8 max-w-2xl space-y-5 p-6">
        <Field label={t('fieldName')} required>
          <Input required value={form.name} onChange={update('name')} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('fieldCategory')} required>
            <Select required value={form.category} onChange={update('category')}>
              <option value="">—</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category[language]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t('fieldAddress')}
            required
            hint={
              language === 'fr'
                ? 'Le quartier suffit ; pas besoin d’une adresse exacte.'
                : 'The quarter is enough; an exact street address is not needed.'
            }
          >
            <Input required value={form.address} onChange={update('address')} />
          </Field>
        </div>

        <Field
          label={t('fieldDescription')}
          required
          hint={
            language === 'fr'
              ? 'Que verrait un visiteur sur place ?'
              : 'What would a visitor actually find there?'
          }
        >
          <Textarea required rows={4} value={form.description} onChange={update('description')} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('fieldHours')}>
            <Input value={form.hours} onChange={update('hours')} placeholder="09:00 – 18:00" />
          </Field>
          <Field label={t('fieldPrice')}>
            <Input value={form.price} onChange={update('price')} placeholder="2000 FCFA" />
          </Field>
          <Field label={t('fieldWebsite')}>
            <Input type="url" value={form.website} onChange={update('website')} />
          </Field>
          <Field label={t('fieldContact')}>
            <Input value={form.contact} onChange={update('contact')} placeholder="+237 …" />
          </Field>
        </div>

        <Field label={t('fieldPhotos')}>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-8 text-sm text-mist-500 transition-colors hover:border-cyan-500/40 hover:text-mist-300">
            <ImagePlus className="h-4 w-4" />
            {language === 'fr' ? 'Ajouter des photos' : 'Add photos'}
            <input type="file" accept="image/*" multiple className="sr-only" />
          </label>
        </Field>

        <div className="flex items-center gap-3 border-t border-white/[0.08] pt-5">
          <Button type="submit">
            <Send className="h-4 w-4" />
            {t('submitSend')}
          </Button>
          <Badge>{t('statusPending')}</Badge>
        </div>
      </form>
    </div>
  )
}

export function Submissions() {
  const { t, submissions, language } = useApp()

  const tone = (status: SubmissionStatus) =>
    status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning'

  const label = (status: SubmissionStatus) =>
    status === 'approved' ? t('statusApproved') : status === 'rejected' ? t('statusRejected') : t('statusPending')

  return (
    <div className="px-5 py-8 lg:px-10">
      <PageHeader
        eyebrow={t('destSubmissions')}
        title={t('destSubmissions')}
        actions={
          <Link to="/app/submit">
            <Button size="sm">{t('destSuggest')}</Button>
          </Link>
        }
      />

      {submissions.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Send className="h-5 w-5" />}
            title={language === 'fr' ? 'Aucune proposition' : 'No submissions yet'}
            body={t('submitBody')}
          />
        </div>
      ) : (
        <ul className="mt-8 max-w-3xl space-y-3">
          {submissions.map((submission) => (
            <li key={submission.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-mist-100">{submission.name}</h2>
                  <p className="mt-0.5 text-2xs text-mist-500">{submission.address}</p>
                </div>
                <Badge tone={tone(submission.status)}>{label(submission.status)}</Badge>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-mist-300">{submission.description}</p>

              {submission.reviewNote && (
                <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.07] p-3 text-xs text-rose-200">
                  {submission.reviewNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
