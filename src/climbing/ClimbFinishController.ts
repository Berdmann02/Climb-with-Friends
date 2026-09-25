import type {RouteType} from '../core/contracts';
import type {ClimbingController} from './ClimbingController';

/** A brief contact lock, followed by a mode-specific handoff. No height triggers. */
export class ClimbFinishController {
  private elapsed=0;
  private acknowledged=false;
  private transferred=false;
  get celebrating(){return this.acknowledged&&!this.transferred;}
  get boulderFinished(){return this.acknowledged&&this.transferred;}
  reset(){this.elapsed=0;this.acknowledged=false;this.transferred=false;}
  update(dt:number,climb:ClimbingController,type:RouteType,onSuccess:()=>void,lower:()=>void){
    if(!climb.active||!climb.finished||this.transferred)return;
    if(!this.acknowledged){this.acknowledged=true;onSuccess();}
    this.elapsed+=dt;
    if(this.elapsed<1.0)return;
    this.transferred=true;
    if(type==='BOULDER')climb.unlockFinish();else lower();
  }
}
