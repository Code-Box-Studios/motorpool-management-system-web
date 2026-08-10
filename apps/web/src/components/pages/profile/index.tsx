import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loading } from '@/components/ui/loader';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import {
  DetailSection,
  DetailGrid,
  DetailItem
} from '@/components/shared/detail-view';
import {
  FormLayout,
  FormSection,
  FormRow,
  FormActions
} from '@/components/shared/form-section';
import { useOwnProfile } from '@/lib/query/profile';
import { useUpdateOwnProfile } from '@/lib/mutation/profile';
import { useChangeUserPassword } from '@/lib/mutation/user-management';
import { roleLabel, present } from '@/lib/role-label';
import {
  useProfileForm,
  usePasswordForm,
  type ProfileFormData,
  type PasswordFormData
} from './actions';

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : undefined;

const initialsFor = (name?: string | null, email?: string | null) => {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
};

// Every role has one of these — a driver and a guard have no user-management
// screen to be edited on, so this is the only place they can fix their own
// phone number or change their password. It is deliberately narrow: the three
// fields PATCH /users/me accepts, the avatar, and a password change. What a
// person is allowed to DO (role, branch, status) and who they are (email) stay
// an admin's call, so they are shown as facts, never as fields.
const Profile = () => {
  const { data: profile, isLoading } = useOwnProfile();
  const updateProfile = useUpdateOwnProfile();
  const changePassword = useChangeUserPassword();

  const form = useProfileForm();
  const passwordForm = usePasswordForm();

  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [pendingData, setPendingData] = useState<ProfileFormData | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [pendingPassword, setPendingPassword] =
    useState<PasswordFormData | null>(null);

  // Seed the form from the profile — but never while it is open. React Query
  // refetches on window focus, and a person who alt-tabs mid-edit should not
  // come back to their half-typed address replaced by the stored one. Leaving
  // the form (save or cancel) re-runs this, so it also does the reset-on-cancel.
  useEffect(() => {
    if (profile && !isEditing) {
      form.reset({
        fullName: profile.fullName,
        phone: profile.phone ?? '',
        address: profile.address ?? ''
      });
    }
  }, [profile, isEditing, form]);

  const onSubmit = (data: ProfileFormData) => {
    setPendingData(data);
    setShowSave(true);
  };

  const handleConfirmSave = () => {
    if (!pendingData) return;
    updateProfile.mutate(
      {
        fullName: pendingData.fullName,
        // Sent even when empty — an empty string is how a person clears a
        // phone number or an address they no longer want on file.
        phone: pendingData.phone,
        address: pendingData.address,
        avatarFile: pendingData.avatar?.[0]
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setAvatarPreview(null);
        },
        onSettled: () => {
          setShowSave(false);
          setPendingData(null);
        }
      }
    );
  };

  const onSubmitPassword = (data: PasswordFormData) => {
    setPendingPassword(data);
    setShowPasswordChange(true);
  };

  const handleConfirmPasswordChange = () => {
    if (!profile || !pendingPassword) return;
    changePassword.mutate(
      {
        id: profile.id,
        currentPassword: pendingPassword.currentPassword,
        newPassword: pendingPassword.newPassword
      },
      {
        onSuccess: () => passwordForm.reset(),
        onSettled: () => {
          setShowPasswordChange(false);
          setPendingPassword(null);
        }
      }
    );
  };

  if (isLoading) return <Loading />;
  if (!profile) {
    return <div className="text-muted-foreground">Profile unavailable</div>;
  }

  const displayName = profile.fullName || profile.email;

  // The four facts an admin owns. Rendered from one list so the edit form and
  // the read view cannot drift apart on what is editable and what is not.
  const managedDetails = (
    <>
      <DetailItem label="Email" value={profile.email} />
      <DetailItem label="Role" value={roleLabel(profile.role)} />
      <DetailItem label="Branch" value={present(profile.branchName)} />
      <DetailItem
        label="Status"
        value={<StatusBadge status={profile.status} />}
      />
    </>
  );

  return (
    // Capped and centred like the other record screens — on a phone at the gate
    // it is a single column, on a desktop it stays a readable measure.
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="My Profile"
        description="Your account details, and the password you sign in with."
        action={
          !isEditing ? (
            <Button onClick={() => setIsEditing(true)}>Edit profile</Button>
          ) : undefined
        }
      />

      {isEditing ? (
        <form id="edit-profile-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection
              title="Your details"
              description="The name, photo and contact details other people see."
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-5">
                  <Avatar className="size-20">
                    <AvatarImage
                      src={avatarPreview ?? profile.avatarUrl ?? undefined}
                      alt=""
                      className="object-cover"
                    />
                    <AvatarFallback>
                      <span className="text-primary-foreground text-lg font-semibold">
                        {initialsFor(profile.fullName, profile.email)}
                      </span>
                    </AvatarFallback>
                  </Avatar>
                  <Controller
                    name="avatar"
                    control={form.control}
                    render={({ field: { onChange, ...field }, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid}
                        className="flex-1"
                      >
                        <FieldLabel htmlFor="profile-avatar">
                          Profile photo
                        </FieldLabel>
                        <Input
                          {...field}
                          id="profile-avatar"
                          type="file"
                          accept="image/*"
                          value={undefined}
                          onChange={(e) => {
                            const files = e.target.files;
                            onChange(files ?? undefined);
                            const file = files?.[0];
                            setAvatarPreview(
                              file ? URL.createObjectURL(file) : null
                            );
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

                <FormRow>
                  <Controller
                    name="fullName"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="profile-fullname">
                          Full Name *
                        </FieldLabel>
                        <Input
                          {...field}
                          id="profile-fullname"
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
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="profile-phone">Phone</FieldLabel>
                        <Input
                          {...field}
                          id="profile-phone"
                          type="tel"
                          aria-invalid={fieldState.invalid}
                          placeholder="Enter phone number"
                          autoComplete="tel"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FormRow>

                <Controller
                  name="address"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="profile-address">Address</FieldLabel>
                      <Textarea
                        {...field}
                        id="profile-address"
                        aria-invalid={fieldState.invalid}
                        placeholder="Enter address"
                        autoComplete="street-address"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            </FormSection>

            <FormSection
              title="Managed by your administrator"
              description="Your email, role, branch and status are set for you — ask an admin if any of these are wrong."
            >
              <DetailGrid className="lg:grid-cols-2">
                {managedDetails}
              </DetailGrid>
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="edit-profile-form"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setAvatarPreview(null);
                }}
              >
                Cancel
              </Button>
            </FormActions>
          </FormLayout>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailSection title="Details">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar className="size-24">
                <AvatarImage
                  src={profile.avatarUrl ?? undefined}
                  alt=""
                  className="object-cover"
                />
                <AvatarFallback>
                  <span className="text-primary-foreground text-xl font-semibold">
                    {initialsFor(profile.fullName, profile.email)}
                  </span>
                </AvatarFallback>
              </Avatar>
              <DetailGrid className="flex-1 lg:grid-cols-2">
                <DetailItem label="Full Name" value={displayName} />
                <DetailItem label="Phone" value={profile.phone} />
                {managedDetails}
                <DetailItem
                  label="Member since"
                  value={formatDate(profile.createdAt)}
                />
                <DetailItem label="Address" value={profile.address} wide />
              </DetailGrid>
            </div>
          </DetailSection>

          <DetailSection
            title="Change password"
            description="You need your current password. Changing it signs you out on your other devices."
          >
            <form
              onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
              className="flex max-w-md flex-col gap-4"
            >
              <Controller
                name="currentPassword"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="current-password">
                      Current password
                    </FieldLabel>
                    <Input
                      {...field}
                      id="current-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      autoComplete="current-password"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="newPassword"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="new-password">New password</FieldLabel>
                    <Input
                      {...field}
                      id="new-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="confirmPassword"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm new password
                    </FieldLabel>
                    <Input
                      {...field}
                      id="confirm-password"
                      type="password"
                      aria-invalid={fieldState.invalid}
                      autoComplete="new-password"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <div>
                <Button type="submit" disabled={changePassword.isPending}>
                  {changePassword.isPending
                    ? 'Saving...'
                    : 'Update my password'}
                </Button>
              </div>
            </form>
          </DetailSection>
        </div>
      )}

      <ConfirmationModal
        open={showSave}
        onOpenChange={setShowSave}
        title="Save Profile"
        description="Save these changes to your profile?"
        confirmLabel="Save Changes"
        loading={updateProfile.isPending}
        onConfirm={handleConfirmSave}
        onCancel={() => setPendingData(null)}
      />

      <ConfirmationModal
        open={showPasswordChange}
        onOpenChange={setShowPasswordChange}
        title="Change Password"
        description="Your other signed-in devices will be signed out, and you may be asked to sign in again here."
        confirmLabel="Change password"
        loading={changePassword.isPending}
        onConfirm={handleConfirmPasswordChange}
        onCancel={() => setPendingPassword(null)}
      />
    </div>
  );
};

export default Profile;
