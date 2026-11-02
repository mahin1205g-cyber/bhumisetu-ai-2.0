import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

/** Shared native form control. Supports input, textarea, and select semantics. */
const Input = forwardRef(function Input({
  as: Element = 'input',
  className = '',
  onChange,
  onFocus,
  onBlur,
  value,
  defaultValue,
  children,
  ...props
}, forwardedRef) {
  const localRef = useRef(null);
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const [focused, setFocused] = useState(false);
  const currentValue = isControlled ? value : uncontrolledValue;

  const setRef = useCallback((element) => {
    localRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  const syncFieldState = useCallback((element, isFocused = focused, fieldValue = currentValue) => {
    const wrapper = element?.parentElement;
    if (!wrapper) return;
    wrapper.classList.toggle('ui-input-focused', isFocused);
    wrapper.classList.toggle('ui-input-filled', String(fieldValue ?? '').length > 0);
  }, [currentValue, focused]);

  useEffect(() => {
    syncFieldState(localRef.current, focused, localRef.current?.value ?? currentValue);
  }, [currentValue, focused, syncFieldState]);

  const handleChange = (event) => {
    const nextValue = event.currentTarget.value;
    if (!isControlled) setUncontrolledValue(nextValue);
    syncFieldState(event.currentTarget, focused, nextValue);
    onChange?.(event);
  };

  const handleFocus = (event) => {
    setFocused(true);
    syncFieldState(event.currentTarget, true, event.currentTarget.value);
    onFocus?.(event);
  };

  const handleBlur = (event) => {
    setFocused(false);
    syncFieldState(event.currentTarget, false, event.currentTarget.value);
    onBlur?.(event);
  };

  return (
    <Element
      {...props}
      ref={setRef}
      value={value}
      defaultValue={isControlled ? undefined : defaultValue}
      className={`ui-input ${className}`.trim()}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
    </Element>
  );
});

Input.displayName = 'Input';

export default Input;
