import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { Button, Field, Input, SafeImage } from '@/components/ui'
import { Wordmark } from '@/components/layout/Wordmark'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

type Mode = 'signin' | 'signup' | 'forgot'

/** Google's mark, inlined so the button needs no external request. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  )
}

export function Auth({ mode: initialMode }: { mode: Mode }) {
  const { t, language, signIn } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'forgot') {
      // Always the same response, so the form cannot be used to discover
      // which addresses have accounts.
      setSent(true)
      return
    }
    signIn(email, mode === 'signup' ? name : undefined)
    navigate('/app/destinations')
  }

  const heading =
    mode === 'signin' ? t('authSignIn') : mode === 'signup' ? t('authSignUp') : t('authForgot')

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* --------------------------------------------------------- form */}
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-mist-500 hover:text-mist-100">
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Link>
          <LanguageToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12"
        >
          <Wordmark size="lg" />
          <h1 className="mt-6 text-2xl font-bold">{heading}</h1>
          <p className="mt-2 text-sm text-mist-500">{t('tagline')}</p>

          {sent ? (
            <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 text-sm text-emerald-200">
              {t('authResetSent')}
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="mt-8 space-y-4">
                {mode === 'signup' && (
                  <Field label={t('authName')} required>
                    <Input
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                )}

                <Field label={t('authEmail')} required>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="you@example.cm"
                  />
                </Field>

                {mode !== 'forgot' && (
                  <Field label={t('authPassword')} required>
                    <Input
                      required
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      minLength={8}
                    />
                  </Field>
                )}

                <Button type="submit" size="lg" className="w-full">
                  {mode === 'forgot' ? (
                    <>
                      <Mail className="h-4 w-4" />
                      {language === 'fr' ? 'Envoyer le lien' : 'Send reset link'}
                    </>
                  ) : (
                    heading
                  )}
                </Button>
              </form>

              {mode !== 'forgot' && (
                <>
                  <div className="my-6 flex items-center gap-3 text-2xs uppercase tracking-wider text-mist-700">
                    <span className="h-px flex-1 bg-white/10" />
                    {t('authOr')}
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      signIn('user@gmail.com', 'Google User')
                      navigate('/app/destinations')
                    }}
                    className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-mist-100 transition-colors hover:bg-white/[0.08]"
                  >
                    <GoogleMark />
                    {t('authGoogle')}
                  </button>
                </>
              )}
            </>
          )}

          <div className="mt-8 space-y-2 text-sm">
            {mode === 'signin' && (
              <>
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-cyan-300 hover:text-cyan-200"
                >
                  {t('authForgot')}
                </button>
                <p className="text-mist-500">
                  {t('authNoAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    {t('authSignUp')}
                  </button>
                </p>
              </>
            )}
            {mode !== 'signin' && (
              <p className="text-mist-500">
                {t('authHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin')
                    setSent(false)
                  }}
                  className="text-cyan-300 hover:text-cyan-200"
                >
                  {t('authSignIn')}
                </button>
              </p>
            )}
          </div>

          <p className="mt-8 text-2xs leading-relaxed text-mist-700">{t('authGuestNote')}</p>
        </motion.div>
      </div>

      {/* -------------------------------------------------------- visual */}
      <div className="relative hidden lg:block">
        <SafeImage
          src="/images/destinations/reunification-monument.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/30" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="max-w-md text-2xl font-semibold leading-snug text-white">
            {language === 'fr'
              ? 'Yaoundé, sept collines et bien plus à découvrir.'
              : 'Yaoundé: seven hills, and a great deal more to find.'}
          </p>
        </div>
      </div>
    </div>
  )
}
