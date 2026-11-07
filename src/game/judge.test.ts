import { describe, it, expect } from "vitest";
import { judge } from "./judge";
import { strums, backing } from "../data/song";
describe("song and timing",()=>{it("has the right 22 strums",()=>{expect(strums.length).toBe(22);expect(strums.map(x=>x.beat)).toEqual([0,1.5,3,4,5.5,7,8,9.5,11,12,14,16,17.5,19,20,21.5,23,24,25.5,27,28,30]);});it("judges and only uses each target once",()=>{const t=[{id:'a',time:1}];expect(judge(1.1,t,new Set(),0)?.result).toBe('Nailed!');expect(judge(.85,t,new Set(),0)?.result).toBe('Close');expect(judge(1.3,t,new Set(),0)).toBeNull();expect(judge(1,t,new Set(['a']),0)).toBeNull();expect(judge(1.1,t,new Set(),100)?.result).toBe('Nailed!');});});

it('keeps the backing band in time with the song',()=>{expect(backing).toHaveLength(32);expect(backing.map(n=>n.beat)).toEqual(Array.from({length:32},(_,i)=>i));expect(new Set(backing.map(n=>n.chord))).toEqual(new Set(['Em','A9']));});
