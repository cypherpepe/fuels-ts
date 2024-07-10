import type { JsonAbiConfigurable } from './JsonAbi';
import type { IType } from './IType';

export interface IConfigurable {
  name: string;
  type: IType;
  rawAbiConfigurable: JsonAbiConfigurable;
}
