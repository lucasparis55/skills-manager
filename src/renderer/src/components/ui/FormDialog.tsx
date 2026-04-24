import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Plus } from 'lucide-react';

export interface FormField {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: 'text' | 'password' | 'textarea' | 'tags' | 'select';
  rows?: number;
  options?: { label: string; value: string }[];
  actionButton?: {
    icon: React.ComponentType<{ className?: string }>;
    tooltip?: string;
    onClick?: (fieldName: string) => Promise<string | void>;
  };
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => void;
  submitLabel?: string;
  initialValues?: Record<string, string>;
}

/**
 * InlineForm - renders form fields and manages state without any dialog wrapper.
 * Used both by FormDialog (standalone) and by SkillEditDialog (nested inside parent dialog).
 */
interface InlineFormProps {
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => void;
  submitLabel?: string;
  initialValues?: Record<string, string>;
  onCancel?: () => void;
  triggerReset?: boolean;
}

export const InlineForm: React.FC<InlineFormProps> = ({
  fields,
  onSubmit,
  submitLabel = 'Save',
  initialValues,
  onCancel,
  triggerReset,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (!initialized) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        if (initialValues?.[f.name]) {
          initial[f.name] = initialValues[f.name];
        } else if (f.defaultValue) {
          initial[f.name] = f.defaultValue;
        }
      });
      setValues(initial);
      setInitialized(true);
    }
  }, [fields, initialValues, initialized]);

  // Reset when triggerReset changes
  useEffect(() => {
    if (triggerReset) {
      setValues({});
      setInitialized(false);
      setTagInput('');
    }
  }, [triggerReset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasEmptyRequired = fields.some(
      (f) => f.required && !values[f.name]?.trim()
    );
    if (hasEmptyRequired) return;
    onSubmit(values);
    setValues({});
    setTagInput('');
    setInitialized(false);
  };

  const isSubmitDisabled = fields.some(
    (f) => f.required && !values[f.name]?.trim()
  );

  const updateValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const renderField = (field: FormField) => {
    const value = values[field.name] ?? '';

    if (field.type === 'textarea') {
      return (
        <textarea
          rows={field.rows || 4}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => updateValue(field.name, e.target.value)}
          className="w-full px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500 resize-y font-mono text-sm"
        />
      );
    }

    if (field.type === 'tags') {
      const tags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : [];

      const addTag = () => {
        const trimmed = tagInput.trim();
        if (!trimmed) return;
        const newTags = tags.includes(trimmed) ? tags : [...tags, trimmed];
        updateValue(field.name, newTags.join(', '));
        setTagInput('');
      };

      const removeTag = (tagToRemove: string) => {
        const newTags = tags.filter((t) => t !== tagToRemove);
        updateValue(field.name, newTags.join(', '));
      };

      return (
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 glass rounded text-xs text-white/70"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-white/40 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="flex-1 px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500 text-sm"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-3 py-2 glass hover:bg-white/[0.10] rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    if (field.type === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(e) => updateValue(field.name, e.target.value)}
          className="w-full px-3 py-2 glass-input text-white focus:outline-none focus:border-blue-500"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    // Default: text or password input
    return (
      <div className="flex gap-2">
        <input
          type={field.type || 'text'}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => updateValue(field.name, e.target.value)}
          className="flex-1 px-3 py-2 glass-input text-white placeholder:text-white/35 focus:outline-none focus:border-blue-500"
        />
        {field.actionButton && (
          <button
            type="button"
            onClick={async () => {
              const result = await field.actionButton?.onClick?.(field.name);
              if (typeof result === 'string') {
                updateValue(field.name, result);
              }
            }}
            title={field.actionButton.tooltip}
            className="px-3 py-2 glass hover:bg-white/[0.10] rounded-lg transition-colors flex-shrink-0"
          >
            {React.createElement(field.actionButton.icon, { className: 'w-4 h-4' })}
          </button>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-white/70 mb-1">
            {field.label}
            {field.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {renderField(field)}
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-white/45 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
            isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onSubmit,
  submitLabel = 'Create',
  initialValues,
}) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-overlayShow" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-dialog rounded-xl p-6 w-full max-w-md shadow-xl data-[state=open]:animate-contentShow focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-lg font-semibold text-white">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-white/40 hover:text-white/80">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="text-sm text-white/45 mb-4">
              {description}
            </DialogPrimitive.Description>
          )}
          <InlineForm
            fields={fields}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
            initialValues={initialValues}
            onCancel={() => onOpenChange(false)}
            triggerReset={!open}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default FormDialog;
