import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useSignupForm, type SignupFormData } from './action';
import { useCreateProfile, useSignUp } from '@/lib/mutation/user-management';
import { toast } from 'sonner';

export function AddUser() {
  const signUp = useSignUp();
  const createProfile = useCreateProfile();
  const form = useSignupForm();

  const onSubmit = (data: SignupFormData) => {
    signUp.mutate(data, {
      onSuccess: (result) => {
        if (result.user) {
          createProfile.mutate(
            {
              userId: result.user.id,
              fullName: data.fullName
            },
            {
              onSuccess: () => {
                toast.success('User Profile created successfully!');
                form.reset();
              },
              onError: (error) => {
                toast.error(`Profile Creation failed: ${error.message}`);
              }
            }
          );
        }
      },
      onError: (error) => {
        toast.error(`Sign up failed: ${error.message}`);
      }
    });
  };

  return (
    <div>
      <form
        className="flex flex-col justify-center p-11 md:p-13"
        id="signup-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">Create an account</h1>
            <p className="text-muted-foreground text-balance">
              The account will be automatically be an admin account.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                  <Input
                    {...field}
                    id="signup-email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter email"
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
                  <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                  <Input
                    {...field}
                    id="signup-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter password"
                    autoComplete="new-password"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <Controller
            name="fullName"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="signup-fullname">Full Name</FieldLabel>
                <Input
                  {...field}
                  id="signup-fullname"
                  type="text"
                  aria-invalid={fieldState.invalid}
                  placeholder="Enter full name"
                  autoComplete="name"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="signup-form"
            disabled={signUp.isPending}
          >
            {signUp.isPending ? 'Signing up...' : 'Sign Up'}
          </Button>
        </Field>
      </form>
    </div>
  );
}
