import { Link } from 'react-router-dom';

function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  className = '',
  disabled = false,
  to,
  loading = false,
  ariaLabel,
}) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md focus:ring-blue-500',
    secondary:
      'bg-white text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 focus:ring-gray-300',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
  };

  const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-label={ariaLabel}
      className={classes}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}

export default Button;
