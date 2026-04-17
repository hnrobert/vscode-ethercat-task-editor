export class TaskTypeMemory {
  private memory = new Map<string, Map<string, Map<number, Record<string, any>>>>();

  save(slaveName: string, taskName: string, taskType: number, values: Record<string, any>) {
    let slaveMap = this.memory.get(slaveName);
    if (!slaveMap) {
      slaveMap = new Map();
      this.memory.set(slaveName, slaveMap);
    }
    let taskMap = slaveMap.get(taskName);
    if (!taskMap) {
      taskMap = new Map();
      slaveMap.set(taskName, taskMap);
    }
    taskMap.set(taskType, { ...values });
  }

  get(slaveName: string, taskName: string, taskType: number): Record<string, any> | null {
    return this.memory.get(slaveName)?.get(taskName)?.get(taskType) ?? null;
  }

  migrateSlave(oldName: string, newName: string) {
    const mem = this.memory.get(oldName);
    if (mem) {
      this.memory.delete(oldName);
      this.memory.set(newName, mem);
    }
  }

  migrateTask(slaveName: string, oldTaskName: string, newTaskName: string) {
    const slaveMem = this.memory.get(slaveName);
    if (slaveMem?.has(oldTaskName)) {
      const taskMem = slaveMem.get(oldTaskName)!;
      slaveMem.delete(oldTaskName);
      slaveMem.set(newTaskName, taskMem);
    }
  }
}
