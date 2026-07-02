import { supabase } from '.';
import type { Tool, NewTool, UpdateTool } from '../types';

export const getTools = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: Tool[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('tools')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching tools:', error);
    throw error;
  }
  return { data: data as Tool[], count };
};

export const getToolById = async (id: string): Promise<Tool> => {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching tool:', error);
    throw error;
  }
  return data as Tool;
};

const uploadToolImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
  const filePath = `tools/${fileName}`;

  const { error } = await supabase.storage.from('um-mms').upload(filePath, file);

  if (error) {
    console.error('Error uploading image:', error);
    throw error;
  }

  const { data } = supabase.storage.from('um-mms').getPublicUrl(filePath);

  return data.publicUrl;
};

export const createTool = async (
  tool: NewTool,
  file?: File
): Promise<Tool> => {
  try {
    const imageUrl = file ? await uploadToolImage(file) : null;

    // Clean up the tool object - convert empty strings to null for UUID and date fields
    const cleanedTool = {
      ...tool,
      borrowed_by: tool.borrowed_by === '' ? null : tool.borrowed_by,
      borrowed_date: tool.borrowed_date === '' ? null : tool.borrowed_date,
      estimated_return_date: tool.estimated_return_date === '' ? null : tool.estimated_return_date,
      description: tool.description === '' ? null : tool.description,
      image: imageUrl
    };

    const { data, error } = await supabase
      .from('tools')
      .insert(cleanedTool)
      .select()
      .single();

    if (error) {
      console.error('Error creating tool:', error);
      throw error;
    }

    return data as Tool;
  } catch (error) {
    console.error('Error in createTool:', error);
    throw error;
  }
};

export const updateTool = async (
  id: string,
  updates: UpdateTool,
  file?: File,
  removeImage: boolean = false
): Promise<Tool> => {
  try {
    const cleanedUpdates = {
      ...updates,
      borrowed_by: updates.borrowed_by === '' ? null : updates.borrowed_by,
      borrowed_date: updates.borrowed_date === '' ? null : updates.borrowed_date,
      estimated_return_date: updates.estimated_return_date === '' ? null : updates.estimated_return_date,
      description: updates.description === '' ? null : updates.description
    };

    if (removeImage) {
      cleanedUpdates.image = null;
    } else if (file) {
      const imageUrl = await uploadToolImage(file);
      cleanedUpdates.image = imageUrl;
    }

    const { data, error } = await supabase
      .from('tools')
      .update(cleanedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tool:', error);
      throw error;
    }

    return data as Tool;
  } catch (error) {
    console.error('Error in updateTool:', error);
    throw error;
  }
};
