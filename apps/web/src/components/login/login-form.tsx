import { useState } from 'react';
import {
  ArrowRight,
  BusFront,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Route,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api/client';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { useLoginForm, type LoginFormData } from './action';
import './login.css';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const form = useLoginForm();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSubmit = async (data: LoginFormData) => {
    setLoginError(null);
    try {
      await login(data.email, data.password);
      navigate({ to: '/' });
    } catch (e) {
      setLoginError(
        e instanceof ApiError
          ? e.message
          : 'Unable to sign in. Please try again.'
      );
    }
  };

  return (
    <div className={cn('login-page', className)} {...props}>
      <header className="login-masthead">
        <div className="login-identity">
          <img
            src="/logo/um-logo.png"
            alt="University of Mindanao seal"
            width="48"
            height="48"
          />
          <div>
            <p className="login-wordmark">
              MMS<span> / </span>Motorpool
            </p>
            <p className="login-university">University of Mindanao</p>
          </div>
        </div>
        <p className="login-portal-label">Motorpool Management System</p>
      </header>

      <main className="login-shell">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="login-story-copy">
            <p className="login-eyebrow">
              <span />
              University operations
            </p>
            <h2 id="login-story-title">
              Every journey,
              <br />
              <em>in good order.</em>
            </h2>
            <p className="login-story-description">
              The people, vehicles, and planning that keep our university
              moving. All connected in one workspace.
            </p>
          </div>

          <div className="login-route-art" aria-hidden="true">
            <svg viewBox="0 0 560 260" fill="none">
              <g
                className="login-plan-lines"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M-30 76H115Q145 76 145 46V-30M-30 94H119Q163 94 163 50V-30M228-30V34Q228 64 258 64H590M246-30V18Q246 46 276 46H590M-30 201H73Q106 201 106 234V290M-30 219H55Q88 219 88 252V290M317 290V194Q317 167 344 167H590M335 290V212Q335 185 362 185H590" />
                <rect x="187" y="106" width="80" height="50" rx="5" />
                <rect x="365" y="88" width="112" height="49" rx="5" />
                <path d="M387 88V137M409 88V137M431 88V137M453 88V137M187 131H267M227 106V156M17 144H74M45 116V172M483 227H531M507 203V251" />
                <circle cx="45" cy="144" r="17" />
                <circle cx="507" cy="227" r="13" />
              </g>
              <path
                className="login-route-shadow"
                d="M40 183H138Q171 183 171 150V138Q171 85 224 85H288Q305 85 305 102V125Q305 153 333 153H508"
              />
              <path
                className="login-route-line"
                d="M40 183H138Q171 183 171 150V138Q171 85 224 85H288Q305 85 305 102V125Q305 153 333 153H508"
              />
              <circle cx="40" cy="183" r="7" className="login-route-endpoint" />
              <circle
                cx="508"
                cy="153"
                r="7"
                className="login-route-endpoint"
              />
              <circle cx="305" cy="120" r="37" className="login-route-halo" />
              <circle cx="305" cy="120" r="25" fill="#f7f0e6" />
              <g
                transform="translate(293 108)"
                stroke="#652b37"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="2" width="16" height="18" rx="4" />
                <path d="M4 11H20M8 2V5H16V2M8 20V22M16 20V22M8 15H8.01M16 15H16.01" />
              </g>
            </svg>
            <span className="login-art-caption">Purpose in every mile.</span>
          </div>

          <div className="login-capabilities">
            <span>
              <BusFront aria-hidden="true" />
              Fleet management
            </span>
            <span>
              <Route aria-hidden="true" />
              Trip coordination
            </span>
            <span>
              <Wrench aria-hidden="true" />
              Vehicle care
            </span>
          </div>
        </section>

        <section className="login-access" aria-labelledby="login-heading">
          <div className="login-form-wrap">
            <div className="login-form-heading">
              <p className="login-access-eyebrow">Account access</p>
              <h1 id="login-heading">Welcome back.</h1>
              <p>Sign in to your motorpool workspace.</p>
            </div>

            <form
              id="login-form"
              className="login-fields"
              onSubmit={form.handleSubmit(handleSubmit)}
              aria-labelledby="login-heading"
              aria-busy={form.formState.isSubmitting}
            >
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-email">Email address</FieldLabel>
                    <Input
                      {...field}
                      id="login-email"
                      type="email"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={
                        fieldState.invalid ? 'login-email-error' : undefined
                      }
                      placeholder="Enter your email address"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="login-input"
                    />
                    {fieldState.invalid && (
                      <FieldError
                        id="login-email-error"
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-password">Password</FieldLabel>
                    <div className="login-password-wrap">
                      <Input
                        {...field}
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={
                          fieldState.invalid
                            ? 'login-password-error'
                            : undefined
                        }
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="login-input login-password-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                        aria-pressed={showPassword}
                        aria-controls="login-password"
                        className="login-password-toggle"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {fieldState.invalid && (
                      <FieldError
                        id="login-password-error"
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />

              {loginError && (
                <p className="login-error" role="alert">
                  {loginError}
                </p>
              )}
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="login-submit"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <LoaderCircle
                      className="login-spinner size-4"
                      aria-hidden="true"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <p className="login-access-note">
              <LockKeyhole aria-hidden="true" />
              For authorized university personnel
            </p>
            <div className="login-help">
              <p>Need a hand signing in?</p>
              <p>
                Contact your system administrator for account access or password
                assistance.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="login-footer">
        <p>Motorpool Management System</p>
        <p>Built for the journeys that matter.</p>
      </footer>
    </div>
  );
}
