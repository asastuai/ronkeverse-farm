"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DemoState,
  Plantation,
  TIERS,
  WORKER_HIRE_COST,
  WORKER_STAMINA_SECONDS,
  FEED_COST_PER_WORKER,
  RESTAKE_FEE_BPS,
  RESTAKE_APR_BOOST_BPS,
  jailPenaltyBps,
  settle,
  loadState,
  saveState,
  resetState,
  validateBuyPlantation,
  validateHireWorkers,
  validateFeedWorkers,
  validateStakeRonke,
  validateUnstakeRonke,
  validateStakeNFTs,
  validateUnstakeNFTs,
} from "./demoFarmStore";

const nowSec = () => Math.floor(Date.now() / 1000);

class ActionError extends Error {}

export function useDemoFarm() {
  const [state, setState] = useState<DemoState>(loadState);
  const [, force] = useState(0);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // tick para que pending rewards se vea actualizar visualmente
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);

  // Wrapper: valida con state actual ANTES de setState. Si falla, lanza fuera del updater.
  const guard = (validator: (s: DemoState) => string | null) => {
    const err = validator(state);
    if (err) throw new ActionError(err);
  };

  const buyPlantation = useCallback(
    (tierId: number) => {
      guard((s) => validateBuyPlantation(s, tierId));
      const tier = TIERS[tierId];
      const now = nowSec();
      setState((s) => ({
        ...s,
        ronkeBalance: s.ronkeBalance - tier.ronkeCost,
        plantations: [
          ...s.plantations,
          {
            id: s.nextPlantId,
            tierId,
            createdAt: now,
            lastSettleAt: now,
            workers: 0,
            staminaUntil: 0,
            accruedNababa: 0,
            restakeMode: false,
          },
        ],
        nextPlantId: s.nextPlantId + 1,
      }));
    },
    [state]
  );

  const hireWorkers = useCallback(
    (plantId: number, count: number) => {
      guard((s) => validateHireWorkers(s, plantId, count));
      const cost = WORKER_HIRE_COST * count;
      const now = nowSec();
      setState((s) => {
        const idx = s.plantations.findIndex((p) => p.id === plantId);
        if (idx === -1) return s;
        const settled = settle(s.plantations[idx], s, now);
        const newStamina =
          settled.staminaUntil < now ? now + WORKER_STAMINA_SECONDS : settled.staminaUntil;
        const updated: Plantation = {
          ...settled,
          workers: settled.workers + count,
          staminaUntil: newStamina,
        };
        const ps = [...s.plantations];
        ps[idx] = updated;
        return { ...s, ronkeBalance: s.ronkeBalance - cost, plantations: ps };
      });
    },
    [state]
  );

  const feedWorkers = useCallback(
    (plantId: number) => {
      guard((s) => validateFeedWorkers(s, plantId));
      const now = nowSec();
      setState((s) => {
        const idx = s.plantations.findIndex((p) => p.id === plantId);
        if (idx === -1) return s;
        const p = s.plantations[idx];
        const cost = FEED_COST_PER_WORKER * p.workers;
        const settled = settle(p, s, now);
        const base = settled.staminaUntil > now ? settled.staminaUntil : now;
        const updated: Plantation = {
          ...settled,
          staminaUntil: base + WORKER_STAMINA_SECONDS,
        };
        const ps = [...s.plantations];
        ps[idx] = updated;
        return { ...s, nababaBalance: s.nababaBalance - cost, plantations: ps };
      });
    },
    [state]
  );

  const claim = useCallback((plantId: number) => {
    const now = nowSec();
    setState((s) => {
      const idx = s.plantations.findIndex((p) => p.id === plantId);
      if (idx === -1) return s;
      const settled = settle(s.plantations[idx], s, now);
      const gross = settled.accruedNababa;
      if (gross === 0) return s;

      let penalty = 0;
      if (!settled.restakeMode) {
        const age = now - settled.createdAt;
        penalty = (gross * jailPenaltyBps(age)) / 10_000;
      }
      const net = gross - penalty;
      const updated: Plantation = { ...settled, accruedNababa: 0 };
      const ps = [...s.plantations];
      ps[idx] = updated;
      return {
        ...s,
        nababaBalance: s.nababaBalance + net,
        plantations: ps,
      };
    });
  }, []);

  const restake = useCallback((plantId: number) => {
    const now = nowSec();
    setState((s) => {
      const idx = s.plantations.findIndex((p) => p.id === plantId);
      if (idx === -1) return s;
      const settled = settle(s.plantations[idx], s, now);
      const gross = settled.accruedNababa;
      if (gross === 0) return s;

      const fee = (gross * RESTAKE_FEE_BPS) / 10_000;
      const reinvested = gross - fee;
      const boosted = reinvested + (reinvested * RESTAKE_APR_BOOST_BPS) / 10_000;
      const updated: Plantation = {
        ...settled,
        accruedNababa: boosted,
        restakeMode: true,
      };
      const ps = [...s.plantations];
      ps[idx] = updated;
      return { ...s, plantations: ps };
    });
  }, []);

  const stakeRonke = useCallback(
    (amount: number) => {
      guard((s) => validateStakeRonke(s, amount));
      setState((s) => ({
        ...s,
        ronkeBalance: s.ronkeBalance - amount,
        ronkeStaked: s.ronkeStaked + amount,
      }));
    },
    [state]
  );

  const unstakeRonke = useCallback(
    (amount: number) => {
      guard((s) => validateUnstakeRonke(s, amount));
      setState((s) => ({
        ...s,
        ronkeBalance: s.ronkeBalance + amount,
        ronkeStaked: s.ronkeStaked - amount,
      }));
    },
    [state]
  );

  const stakeNFTs = useCallback(
    (ids: number[]) => {
      guard((s) => validateStakeNFTs(s, ids));
      setState((s) => ({
        ...s,
        ownedNftIds: s.ownedNftIds.filter((id) => !ids.includes(id)),
        stakedNftIds: [...s.stakedNftIds, ...ids],
        nftBalance: s.nftBalance - ids.length,
      }));
    },
    [state]
  );

  const unstakeNFTs = useCallback(
    (ids: number[]) => {
      guard((s) => validateUnstakeNFTs(s, ids));
      setState((s) => ({
        ...s,
        stakedNftIds: s.stakedNftIds.filter((id) => !ids.includes(id)),
        ownedNftIds: [...s.ownedNftIds, ...ids],
        nftBalance: s.nftBalance + ids.length,
      }));
    },
    [state]
  );

  const setOtherWorkers = useCallback((n: number) => {
    setState((s) => ({ ...s, otherWorkersActive: Math.max(0, Math.floor(n)) }));
  }, []);

  const reset = useCallback(() => {
    resetState();
    setState(loadState());
  }, []);

  return {
    state,
    actions: {
      buyPlantation,
      hireWorkers,
      feedWorkers,
      claim,
      restake,
      stakeRonke,
      unstakeRonke,
      stakeNFTs,
      unstakeNFTs,
      setOtherWorkers,
      reset,
    },
  };
}
