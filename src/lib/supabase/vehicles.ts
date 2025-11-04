import { supabase } from '.';
import type { Vehicle, NewVehicle, UpdateVehicle } from '../types'; 

export const getVehicles = async (page: number = 1, limit: number = 10): Promise<{ data: Vehicle[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('vehicles')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching vehicles:', error);
    throw error;
  }
  return { data: data as Vehicle[], count }; 
};

export const getVehicleById = async (id: string): Promise<Vehicle> => {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching vehicle:', error);
    throw error;
  }
  return data as Vehicle;
};

const uploadVehicleImages = async (files: File[]): Promise<string[]> => {
  const urls: string[] = [];
  for (const file of files) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
    const filePath = `vehicles/${fileName}`;

    const { error } = await supabase.storage
      .from('um-mms')
      .upload(filePath, file);

    if (error) {
      console.error('Error uploading image:', error);
      throw error;
    }

    const { data } = supabase.storage
      .from('um-mms')
      .getPublicUrl(filePath);

    urls.push(data.publicUrl);
  }
  return urls;
};

export const createVehicle = async (
  vehicle: NewVehicle, 
  files: File[] = []
): Promise<Vehicle> => {
  try {
    const imageUrls = files.length > 0 ? await uploadVehicleImages(files) : [];

    const { data, error } = await supabase
      .from('vehicles')
      .insert({ ...vehicle, images: imageUrls })
      .select()
      .single();

    if (error) {
      console.error('Error creating vehicle:', error);
      throw error;
    }

    return data as Vehicle;
  } catch (error) {
    console.error('Error in createVehicle:', error);
    throw error;
  }
};

export const updateVehicle = async (
  id: string,
  updates: UpdateVehicle,
  files: File[] = []
): Promise<Vehicle> => {
  try {
    let imageUrls: string[] = [];
    if (files.length > 0) {
      imageUrls = await uploadVehicleImages(files);
      const current = await getVehicleById(id);
      updates.images = [...(current.images || []), ...imageUrls];
    }
    const { data, error } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating vehicle:', error);
      throw error;
    }

    return data as Vehicle;
  } catch (error) {
    console.error('Error in updateVehicle:', error);
    throw error;
  }
};