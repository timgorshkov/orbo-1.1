'use client';

import { useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';

interface SchemaField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  max_length?: number;
}

interface CollectionSchema {
  fields: SchemaField[];
}

interface DynamicFormProps {
  schema: CollectionSchema;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  initialData?: Record<string, any>;
}

export default function DynamicForm({
  schema,
  onSubmit,
  onCancel,
  submitLabel = 'Создать',
  initialData = {},
}: DynamicFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});

  const handleChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    // Clear error when user starts typing
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const handleFileUpload = async (fieldName: string, file: File) => {
    try {
      setUploadingFiles(prev => ({ ...prev, [fieldName]: true }));

      // TODO: Implement file upload to Supabase Storage
      // For now, just create a data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        handleChange(fieldName, dataUrl);
        setUploadingFiles(prev => ({ ...prev, [fieldName]: false }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      setErrors(prev => ({ ...prev, [fieldName]: 'Не удалось загрузить файл' }));
      setUploadingFiles(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    schema.fields.forEach(field => {
      if (field.required && !formData[field.name]) {
        newErrors[field.name] = `${field.label} обязательно`;
      }

      if (field.type === 'string' && formData[field.name]) {
        if (field.max_length && formData[field.name].length > field.max_length) {
          newErrors[field.name] = `Максимум ${field.max_length} символов`;
        }
      }

      if (field.type === 'number' && formData[field.name] !== undefined && formData[field.name] !== '') {
        const num = parseFloat(formData[field.name]);
        if (isNaN(num)) {
          newErrors[field.name] = 'Должно быть числом';
        } else {
          if (field.min !== undefined && num < field.min) {
            newErrors[field.name] = `Минимум ${field.min}`;
          }
          if (field.max !== undefined && num > field.max) {
            newErrors[field.name] = `Максимум ${field.max}`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
      alert('Не удалось отправить форму. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: SchemaField) => {
    const value = formData[field.name] || '';
    const error = errors[field.name];
    const isUploading = uploadingFiles[field.name];

    switch (field.type) {
      case 'string':
      case 'url':
        return (
          <input
            type={field.type === 'url' ? 'url' : 'text'}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            maxLength={field.max_length}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={field.type === 'url' ? 'https://example.com/image.jpg' : field.label}
          />
        );

      case 'tel':
      case 'phone':
        return (
          <input
            type="tel"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            maxLength={field.max_length || 20}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="+7 (999) 123-45-67"
          />
        );

      case 'text':
        return (
          <textarea
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            maxLength={field.max_length}
            rows={4}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={field.label}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(field.name, parseFloat(e.target.value) || '')}
            min={field.min}
            max={field.max}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={field.label}
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <option value="">Выберите...</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'image':
      case 'images':
        return (
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(field.name, file);
              }}
              className="hidden"
              id={`file-${field.name}`}
              disabled={isUploading}
            />
            <label
              htmlFor={`file-${field.name}`}
              className={`inline-flex items-center px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                error
                  ? 'border-red-500 text-red-700'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Загрузить фото
                </>
              )}
            </label>

            {value && !isUploading && (
              <div className="mt-2 relative inline-block">
                <img
                  src={value}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => handleChange(field.name, '')}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        );

      case 'boolean':
        return (
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">Да</span>
          </label>
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={field.label}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {schema.fields.map(field => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {renderField(field)}
          {errors[field.name] && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors[field.name]}
            </p>
          )}
          {field.max_length && field.type === 'string' && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {(formData[field.name] || '').length} / {field.max_length}
            </p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Сохранение...
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}

