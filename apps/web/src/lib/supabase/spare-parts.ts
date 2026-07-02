import { supabase } from '.';
import type { SparePart, NewSparePart, UpdateSparePart } from '../types';

export const getSpareParts = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: SparePart[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('spare_parts')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching spare parts:', error);
    throw error;
  }
  return { data: data as SparePart[], count };
};

export const getSparePartById = async (id: string): Promise<SparePart> => {
  const { data, error } = await supabase
    .from('spare_parts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching spare part:', error);
    throw error;
  }
  return data as SparePart;
};

const uploadSparePartImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
  const filePath = `spare-parts/${fileName}`;

  const { error } = await supabase.storage.from('um-mms').upload(filePath, file);

  if (error) {
    console.error('Error uploading image:', error);
    throw error;
  }

  const { data } = supabase.storage.from('um-mms').getPublicUrl(filePath);

  return data.publicUrl;
};

export const createSparePart = async (
  sparePart: NewSparePart,
  file?: File
): Promise<SparePart> => {
  try {
    const imageUrl = file ? await uploadSparePartImage(file) : null;

    const cleanedSparePart = {
      ...sparePart,
      brand: sparePart.brand === '' ? null : sparePart.brand,
      description: sparePart.description === '' ? null : sparePart.description,
      quantity: sparePart.quantity === null ? 0 : sparePart.quantity,
      image: imageUrl
    };

    const { data, error } = await supabase
      .from('spare_parts')
      .insert(cleanedSparePart)
      .select()
      .single();

    if (error) {
      console.error('Error creating spare part:', error);
      throw error;
    }

    return data as SparePart;
  } catch (error) {
    console.error('Error in createSparePart:', error);
    throw error;
  }
};

export const updateSparePart = async (
  id: string,
  updates: UpdateSparePart,
  file?: File,
  removeImage: boolean = false
): Promise<SparePart> => {
  try {
    const cleanedUpdates = {
      ...updates,
      brand: updates.brand === '' ? null : updates.brand,
      description: updates.description === '' ? null : updates.description,
      quantity: updates.quantity === null ? 0 : updates.quantity
    };

    let imageUrl: string | null = null;

    if (file) {
      imageUrl = await uploadSparePartImage(file);
      cleanedUpdates.image = imageUrl;
    } else if (removeImage) {
      cleanedUpdates.image = null;
    }

    const { data, error } = await supabase
      .from('spare_parts')
      .update(cleanedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating spare part:', error);
      throw error;
    }

    return data as SparePart;
  } catch (error) {
    console.error('Error in updateSparePart:', error);
    throw error;
  }
};

export const deleteSparePart = async (id: string): Promise<void> => {
  const { error } = await supabase.from('spare_parts').delete().eq('id', id);
  if (error) {
    console.error('Error deleting spare part:', error);
    throw error;
  }
};
