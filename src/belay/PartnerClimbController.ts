import {Vector3} from 'three';
import {ClimbingController} from '../climbing/ClimbingController';
import type {ContactRequest,LimbId} from '../climbing/types';
import {isHand} from '../climbing/types';
import type {NaturalRockSurface} from '../world/NaturalRockSurface';

/** The partner uses the same continuous limb/body solver while the player handles rope. */
export class PartnerClimbController {
  private sequence:LimbId[]=['leftHand','rightHand','leftFoot','rightFoot'];
  private index=0;private pause=0;private attempt=0;private target:ContactRequest|null=null;
  reset(){this.index=0;this.pause=1.5;this.attempt=0;this.target=null;}
  update(dt:number,climb:ClimbingController,rock:NaturalRockSurface):void {
    if(!climb.active||climb.finished)return;
    if(this.pause>0){this.pause-=dt;return;}
    const limb=this.sequence[this.index];
    if(!climb.controlling){
      const current=climb.contacts[limb].point,hand=isHand(limb),side=limb.startsWith('left')?-1:1;
      let best:ContactRequest|null=null,cost=Infinity;
      // Read nearby topology privately. Nothing is exposed or highlighted for the player.
      const baseY=hand?current.y+.28:Math.min(current.y+.30,climb.body.pelvis.y+.18);
      for(let x=-.18;x<=.18;x+=.09)for(let y=0;y<=.24;y+=.06){
        const sample=rock.sample(new Vector3(climb.body.root.x+side*(hand?.3:.19)+x,baseY+y,0));if(!sample)continue;
        const anchor=hand?climb.body.shoulders[side<0?'left':'right']:climb.body.hips[side<0?'left':'right'];
        if(sample.point.distanceTo(anchor)>(hand?.73:.77))continue;
        const security=hand?sample.strength:Math.max(.3,sample.normal.y*.8+sample.friction*.4);
        const score=-security+Math.abs(x)*.45+Math.abs(y-.12)*.15;
        if(score<cost){cost=score;best={point:sample.point,normal:sample.normal,rock:sample,surfaceHit:true};}
      }
      if(!best){this.pause=.6;this.index=(this.index+1)%4;return;}
      this.target=best;this.attempt=0;climb.selectLimb(limb);
    }
    this.attempt+=dt;climb.aim(this.target);climb.setReachDrive(isHand(limb));
    const actual=climb.actualLimbPosition,sample=rock.nearby(actual,.065);
    if(this.attempt>.35&&sample&&climb.requestMove({point:sample.point,normal:sample.normal,rock:sample,surfaceHit:true}).accepted){
      this.index=(this.index+1)%4;this.pause=1.0;this.target=null;climb.setReachDrive(false);
    }else if(this.attempt>2.2){
      const previous=rock.sample(climb.contacts[limb].point);
      if(previous)climb.aim({point:previous.point,normal:previous.normal,rock:previous,surfaceHit:true});
      this.attempt=0;this.target=previous?{point:previous.point,normal:previous.normal,rock:previous,surfaceHit:true}:this.target;
    }
  }
}
