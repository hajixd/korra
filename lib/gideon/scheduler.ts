export const runInParallel = async <T>(tasks: Array<Promise<T>>): Promise<T[]> => {
  return Promise.all(tasks);
};
