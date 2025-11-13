'use client';

type Visibility = 'public' | 'members' | 'private';

interface VisibilityBadgeProps {
  visibility: Visibility;
  size?: 'sm' | 'md' | 'lg';
}

export default function VisibilityBadge({ visibility, size = 'sm' }: VisibilityBadgeProps) {
  const config = {
    public: {
      label: 'Публичное',
      icon: '🌍',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-700 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    members: {
      label: 'Для участников',
      icon: '👥',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-200 dark:border-green-800',
    },
    private: {
      label: 'Приватное',
      icon: '🔒',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      textColor: 'text-gray-700 dark:text-gray-400',
      borderColor: 'border-gray-200 dark:border-gray-700',
    },
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  const current = config[visibility];

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium border
        ${current.bgColor} ${current.textColor} ${current.borderColor}
        ${sizeClasses[size]}
      `}
    >
      <span>{current.icon}</span>
      <span>{current.label}</span>
    </span>
  );
}

