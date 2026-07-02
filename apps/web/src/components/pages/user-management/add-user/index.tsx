// src/components/pages/user-management/add-user/index.tsx
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Controller } from 'react-hook-form';
import { useSignupForm, type SignupFormData } from './action';
import { useSignUp } from '@/lib/mutation/user-management';
import { useRoles } from '@/lib/query/roles';
import { useBranches } from '@/lib/query/shared';
import { useState } from 'react';
import { TrashIcon } from 'lucide-react';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';

export function AddUser() {
  const signUp = useSignUp();
  const form = useSignupForm();
  const { data: roles } = useRoles();
  const { data: branches } = useBranches();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<SignupFormData | null>(null);

  const onSubmit = async (data: SignupFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const handleConfirmAdd = () => {
    if (!pendingData) return;
    signUp.mutate(
      {
        email: pendingData.email,
        password: pendingData.password,
        fullName: pendingData.fullName,
        role_id: pendingData.role_id,
        branch_id: pendingData.branch_id,
        avatarFile: pendingData.avatar?.[0]
      },
      {
        onSettled: () => {
          setShowConfirm(false);
          setPendingData(null);
        }
      }
    );
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
              Create a new admin or driver account.
            </p>
          </div>
          {avatarPreview && (
            <div className="w-full max-w-xs">
              <div className="relative">
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="aspect-square w-full rounded-lg border bg-white object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 rounded-full p-1"
                  onClick={() => {
                    setAvatarPreview(null);
                    form.setValue('avatar', undefined);
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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
          <Controller
            name="avatar"
            control={form.control}
            render={({ field: { onChange, ...field }, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="signup-avatar">Avatar</FieldLabel>
                <Input
                  {...field}
                  id="signup-avatar"
                  type="file"
                  accept="image/*"
                  value={undefined}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      onChange(files);
                      // Create preview
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setAvatarPreview(reader.result as string);
                      };
                      reader.readAsDataURL(files[0]);
                    }
                  }}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <div className="grid grid-cols-2 gap-11">
            <Controller
              name="branch_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-branch">Branch *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="role_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="signup-role">Role *</FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name
                            .split('_')
                            .map(
                              (word) =>
                                word.charAt(0).toUpperCase() + word.slice(1)
                            )
                            .join(' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </FieldGroup>

        <Field className="mt-10 w-fit">
          <Button
            type="submit"
            className="w-fit px-11"
            form="signup-form"
            disabled={signUp.isPending}
          >
            {signUp.isPending ? 'Creating user...' : 'Sign Up'}
          </Button>
        </Field>
      </form>

      <ConfirmationModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Create User Account"
        description="Are you sure you want to create this user account?"
        confirmLabel="Create Account"
        loading={signUp.isPending}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}
