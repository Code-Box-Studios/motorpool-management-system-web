import { supabase } from ".";

export const getAllBranches = async () => {
  const { data, error } = await supabase.from('branches').select('*');
  if (error) {
    console.error('Error fetching branches:', error);
    throw error;
  }
  return data;
};
