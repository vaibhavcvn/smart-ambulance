import fs from 'fs';
import path from 'path';
import { RandomForestRegression } from 'ml-random-forest';

export class ModelStore {
  private static instance: ModelStore;
  private model: any = null;
  private modelPath: string = '';

  private constructor() {}

  public static getInstance(): ModelStore {
    if (!ModelStore.instance) {
      ModelStore.instance = new ModelStore();
    }
    return ModelStore.instance;
  }

  public setModelPath(filePath: string): void {
    this.modelPath = filePath;
  }

  public loadModel(filePath?: string): boolean {
    const targetPath = filePath || this.modelPath;
    if (!targetPath) return false;

    try {
      if (!fs.existsSync(targetPath)) {
        return false;
      }
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.model = RandomForestRegression.load(parsed);
      this.modelPath = targetPath;
      return true;
    } catch (err) {
      console.error(`Failed to load Random Forest model from ${targetPath}:`, err);
      this.model = null;
      return false;
    }
  }

  public saveModel(model: any, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = model.toJSON();
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf-8');
    this.model = model;
    this.modelPath = filePath;
  }

  public getModel(): any | null {
    return this.model;
  }

  public isLoaded(): boolean {
    return this.model !== null;
  }
}
