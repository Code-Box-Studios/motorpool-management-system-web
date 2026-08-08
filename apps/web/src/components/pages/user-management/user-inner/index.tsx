import { useEffect, useState, type FormEvent } from 'react';
import { Controller } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { USER_ROLES } from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loading } from '@/components/ui/loader';
import { ConfirmationModal } from '@/components/shared/confirmation-modal';
import {
  RecordHeader,
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
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';
import { useUser } from '@/lib/query/user-management';
import {
  useUpdateUser,
  useChangeUserPassword,
  useDeleteUser
} from '@/lib/mutation/user-management';
import { useRoles } from '@/lib/query/roles';
import { useBranches } from '@/lib/query/shared';
import { useUserRole } from '@/hooks/use-user-role';
import { roleLabel, present } from '@/lib/role-label';
import { useUserUpdateForm, type UpdateUserFormData } from './actions';

const USER_STATUSES = ['active', 'inactive'] as const;
const statusLabel = (status: string) =>
  status === 'inactive' ? 'Inactive' : 'Active';

// The list hands us an already-formatted role label ("EVP Operations"); the
// roles query keys on the raw db name ("evp_operations"). Normalise the label
// back to that key so the edit form can pre-select the current role.
const roleKey = (label?: string | null) =>
  label ? label.toLowerCase().replace(/[\s-]+/g, '_') : '';

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

const UserInner = ({ userId }: { userId: string }) => {
  const { data: user, isLoading } = useUser(userId);
  const { data: roles } = useRoles();
  const { data: branches } = useBranches();
  const { data: currentUser } = useUserRole();
  const updateUser = useUpdateUser();
  const changePassword = useChangeUserPassword();
  const deleteUser = useDeleteUser();
  const navigate = useNavigate();

  const form = useUserUpdateForm();

  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [pendingData, setPendingData] = useState<UpdateUserFormData | null>(
    null
  );
  const [showDelete, setShowDelete] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  useBreadcrumbLabel(user?.full_name ?? undefined);

  // Managing users is an admin capability; everyone else gets a read-only view.
  const isAdmin = currentUser?.role === USER_ROLES.admin;
  const isSelf = currentUser?.user_id === userId;

  useEffect(() => {
    if (user && roles && branches) {
      form.reset({
        fullName: user.full_name || '',
        status: user.status === 'inactive' ? 'inactive' : 'active',
        role_id: roles.find((r) => r.name === roleKey(user.role))?.id ?? '',
        branch_id: user.branch_id ?? ''
      });
    }
  }, [user, roles, branches, form]);

  const onSubmit = (data: UpdateUserFormData) => {
    setPendingData(data);
    setShowUpdate(true);
  };

  const handleConfirmUpdate = () => {
    if (!user || !pendingData) return;
    updateUser.mutate(
      {
        id: user.id,
        fullName: pendingData.fullName,
        status: pendingData.status,
        roleId: pendingData.role_id,
        branchId: pendingData.branch_id,
        avatarFile: pendingData.avatar?.[0]
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setAvatarPreview(null);
          navigate({ to: '/user-management' });
        },
        onSettled: () => {
          setShowUpdate(false);
          setPendingData(null);
        }
      }
    );
  };

  const handleResetPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    changePassword.mutate(
      {
        id: user.id,
        newPassword,
        currentPassword: isSelf ? currentPassword : undefined
      },
      {
        onSuccess: () => {
          setNewPassword('');
          setCurrentPassword('');
        }
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!user) return;
    deleteUser.mutate(user.id, {
      onSuccess: () => navigate({ to: '/user-management' }),
      onSettled: () => setShowDelete(false)
    });
  };

  if (isLoading) return <Loading />;
  if (!user) return <div className="text-muted-foreground">User not found</div>;

  const displayName = user.full_name || user.email || 'User';

  return (
    // Cap the record to a comfortable, centred column — the same treatment the
    // other detail pages use so a profile reads as one card, not a sparse band.
    <div className="mx-auto w-full max-w-4xl">
      <RecordHeader
        title={displayName}
        status={user.status ?? undefined}
        meta={user.email}
        backTo="/user-management"
        backLabel="User Management"
        actions={
          !isEditing && isAdmin ? (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          ) : undefined
        }
      />

      {isEditing ? (
        <form id="edit-user-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FormLayout>
            <FormSection
              title="Profile"
              description="Who this account belongs to, and what it is allowed to do."
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-5">
                  <Avatar className="size-20">
                    <AvatarImage
                      src={avatarPreview ?? user.avatar_url ?? undefined}
                      alt=""
                      className="object-cover"
                    />
                    <AvatarFallback>
                      <span className="text-primary-foreground text-lg font-semibold">
                        {initialsFor(user.full_name, user.email)}
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
                        <FieldLabel htmlFor="user-avatar">
                          Profile photo
                        </FieldLabel>
                        <Input
                          {...field}
                          id="user-avatar"
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
                        <FieldLabel htmlFor="fullName">Full Name *</FieldLabel>
                        <Input
                          {...field}
                          id="fullName"
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
                    name="status"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="user-status">Status</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger id="user-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {USER_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {statusLabel(status)}
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

                <FormRow>
                  <Controller
                    name="branch_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="user-branch">Branch *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger id="user-branch">
                            <SelectValue placeholder="Select a branch" />
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
                        <FieldLabel htmlFor="user-role">Role *</FieldLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger id="user-role">
                            <SelectValue placeholder="Select a role" />
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
              </div>
            </FormSection>

            <FormActions>
              <Button
                type="submit"
                form="edit-user-form"
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? 'Saving...' : 'Save Changes'}
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
          <DetailSection title="Profile">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar className="size-24">
                <AvatarImage
                  src={user.avatar_url ?? undefined}
                  alt=""
                  className="object-cover"
                />
                <AvatarFallback>
                  <span className="text-primary-foreground text-xl font-semibold">
                    {initialsFor(user.full_name, user.email)}
                  </span>
                </AvatarFallback>
              </Avatar>
              <DetailGrid className="flex-1 lg:grid-cols-2">
                <DetailItem label="Email" value={user.email} />
                <DetailItem label="Role" value={roleLabel(user.role)} />
                <DetailItem label="Branch" value={present(user.branch_name)} />
                <DetailItem label="Joined" value={formatDate(user.created_at)} />
              </DetailGrid>
            </div>
          </DetailSection>

          {isAdmin && (
            <DetailSection
              title="Reset password"
              description={
                isSelf
                  ? 'Changing your own password requires your current one, and signs you out everywhere.'
                  : 'Set a new password for this user. It signs them out everywhere.'
              }
            >
              <form
                onSubmit={handleResetPassword}
                className="flex max-w-md flex-col gap-4"
              >
                {isSelf && (
                  <Field>
                    <FieldLabel htmlFor="current-password">
                      Current password
                    </FieldLabel>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>
                <div>
                  <Button
                    type="submit"
                    disabled={
                      newPassword.length < 8 ||
                      (isSelf && currentPassword.length === 0) ||
                      changePassword.isPending
                    }
                  >
                    {changePassword.isPending ? 'Saving...' : 'Set password'}
                  </Button>
                </div>
              </form>
            </DetailSection>
          )}

          {isAdmin && !isSelf && (
            <DetailSection
              title="Danger zone"
              description="Deleting a user is permanent. If the account is referenced by existing records, deactivate it (set status to Inactive) instead."
            >
              <Button
                variant="destructive"
                onClick={() => setShowDelete(true)}
              >
                Delete user
              </Button>
            </DetailSection>
          )}
        </div>
      )}

      <ConfirmationModal
        open={showUpdate}
        onOpenChange={setShowUpdate}
        title="Update User"
        description="Save these changes to the user account?"
        confirmLabel="Save Changes"
        loading={updateUser.isPending}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setPendingData(null)}
      />

      <ConfirmationModal
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete User"
        description="This permanently removes the user account. This action cannot be undone."
        confirmLabel="Delete permanently"
        variant="destructive"
        loading={deleteUser.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default UserInner;
