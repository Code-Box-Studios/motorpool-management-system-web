// src/components/pages/user-management/add-user/index.tsx
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import PageHeader from '@/components/shared/page-header';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import { roleLabel } from '@/lib/role-label';

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
      <PageHeader
        title="Create an account"
        description="Create a new admin or driver account."
      />

      <form id="signup-form" onSubmit={form.handleSubmit(onSubmit)}>
        <FormLayout>
          <FormSection
            title="Identity"
            description="Who this account belongs to."
          >
            <FormRow>
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
            </FormRow>
          </FormSection>

          <FormSection
            title="Role & branch"
            description="What this account is allowed to do, and where it reports."
          >
            <FormRow>
              <Controller
                name="branch_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="signup-branch">Branch *</FieldLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger id="signup-branch">
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
                      <SelectTrigger id="signup-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {roleLabel(role.name) ?? role.name}
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
            </FormRow>
          </FormSection>

          <FormSection
            title="Credentials"
            description="The password this person signs in with. They can change it later."
          >
            <FormRow>
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
            </FormRow>
          </FormSection>

          <FormSection title="Avatar" description="Optional.">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {avatarPreview && (
                <div className="relative w-32 shrink-0">
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="border-border bg-card aspect-square w-full rounded-[20px] border object-cover"
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
              )}
              <Controller
                name="avatar"
                control={form.control}
                render={({ field: { onChange, ...field }, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="flex-1">
                    <FieldLabel htmlFor="signup-avatar">
                      Profile photo
                    </FieldLabel>
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
            </div>
          </FormSection>

          <FormActions>
            <Button
              type="submit"
              form="signup-form"
              disabled={signUp.isPending}
              className="px-11"
            >
              {signUp.isPending ? 'Creating user...' : 'Sign Up'}
            </Button>
            <Link
              to="/user-management"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Cancel
            </Link>
          </FormActions>
        </FormLayout>
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
