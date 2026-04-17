import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
}));

vi.mock('./App', () => ({
  default: () => null,
}));

describe('renderer main entry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    errorSpy.mockClear();
  });

  it('mounts app when root element exists', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('logs error when root element is missing', async () => {
    await import('./main');
    expect(createRootMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Root element not found!');
  });
});
