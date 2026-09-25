import type {RouteData,RouteType,WallSpec} from '../core/contracts';

/** Wall identity owns mode restrictions, including migration of version-one saves. */
export function routeTypeForWall(wallId:string):RouteType {
  return wallId.startsWith('outdoor')?'LEAD':wallId==='gym-boulder'?'BOULDER':'TOP_ROPE';
}
export function routeMatchesWall(route:RouteData,wall:WallSpec):boolean {
  return route.wallId===wall.id&&(route.routeType??routeTypeForWall(route.wallId))===(wall.routeType??routeTypeForWall(wall.id));
}
