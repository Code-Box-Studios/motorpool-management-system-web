import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldDescription, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useSignIn } from '@/lib/mutation/auth';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useLoginForm, type LoginFormData } from './action';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const signIn = useSignIn();
  const form = useLoginForm();

  const onSubmit = (data: LoginFormData) => {
    signIn.mutate(data);
  };

  return (
    <div className={cn('flex w-full flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="flex flex-col items-center justify-center p-11 md:p-13"
            id="login-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">
                  Motorpool Management System
                </h1>
                <p className="text-muted-foreground text-balance">
                  Login to your account
                </p>
              </div>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-email">Email</FieldLabel>
                    <Input
                      {...field}
                      id="login-email"
                      type="email"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter your email"
                      autoComplete="email"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
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
                    <Input
                      {...field}
                      id="login-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>

            <Field className="mt-10 flex justify-end">
              <Button
                type="submit"
                form="login-form"
                disabled={signIn.isPending}
                className="w-full"
              >
                {signIn.isPending ? 'Signing in...' : 'Sign In'}
              </Button>
            </Field>

            <FieldDescription className="pt-3 text-center">
              Don&apos;t have an account? <span>Contact Admin</span>
            </FieldDescription>
          </form>
          <div className="bg-muted hidden md:block">
            <img
              src="/logo/mms-logo.png"
              alt="Image"
              className="size-full object-cover p-20"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{' '}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
}
