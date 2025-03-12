/**
 * ItemGenerator - アイテム自動生成システム
 * 
 * 概要:
 * このスクリプトは、指定された位置で定期的にアイテムを生成するシステムを実装します。
 * 
 * 主な機能:
 * 1. ジェネレーターの設定
 *    - トライアルキーを使用してジェネレーターを設定
 *    - 生成間隔、アイテムの種類、生成数を設定可能
 * 
 * 2. アイテムの生成
 *    - 設定された間隔でアイテムを自動生成
 *    - 無効なアイテムの生成防止
 *    - 複数ディメンションでの動作対応
 * 
 * 3. 管理機能
 *    - クリエイティブモードでの設定削除
 *    - ジェネレーターブロックの破壊防止
 *    - バリアブロックとアーマースタンドによる位置管理
 * 
 * 使用方法:
 * 1. 設定: トライアルキーで対象ブロックを使用
 * 2. 設定変更: 再度トライアルキーで使用
 * 3. 削除: クリエイティブモードでブロックを破壊
 * 
 * 技術的な詳細:
 * - 位置管理: バリアブロックとアーマースタンドを使用
 * - データ保持: エンティティタグを使用
 * - イベント処理: beforeEvents, afterEventsを使用
 * - 座標オフセット: 99ブロック上空にバリアブロックを設置
 * 
 * @version 1.0.0
 * @license MIT
 */

import { world, system } from '@minecraft/server';

// テレポート対象のブロックタイプを指定
// プレイヤーがこれらのブロックの上に立っている場合のみテレポートが可能
const allowedBlocks = ["minecraft:diamond_block", "minecraft:netherite_block", "minecraft:emerald_block", "minecraft:lapis_block", "minecraft:gold_block", "minecraft:iron_block", "minecraft:copper_block"];

// プレイヤーの状態を保持するためのマップ
// キー: プレイヤーID
// 値: { hasTeleportedDown: 下方向へのテレポート実行済みか, hasTeleportedUp: 上方向へのテレポート実行済みか }
const playerStates = new Map();

// 探索範囲の設定
const config = {
    maximum: 100,        // 最大探索ブロック数
    miniLimit: -65,      // 最小高さ制限
    maxLimitOW: 340,     // オーバーワールドの最大高さ制限
    maxLimitETC: 255,    // ネザーとエンドの最大高さ制限
    dimensions: ["minecraft:nether", "minecraft:overworld", "minecraft:the_end"]  // 対象次元
};

/**
 * プレイヤーの状態を初期化または取得
 * @param {string} playerId - プレイヤーのID
 * @returns {Object} プレイヤーの状態オブジェクト
 */
function getPlayerState(playerId) {
    // プレイヤーの状態が存在しない場合は初期化
    if (!playerStates.has(playerId)) {
        playerStates.set(playerId, { hasTeleportedDown: false, hasTeleportedUp: false });
    }
    return playerStates.get(playerId);
}

/**
 * プレイヤーの状態をリセット
 * @param {Object} playerState - プレイヤーの状態オブジェクト
 * @param {Object} player - プレイヤーオブジェクト
 */
function resetPlayerState(playerState, player) {
    // スニークを解除したら下方向テレポートの状態をリセット
    if (!player.isSneaking) playerState.hasTeleportedDown = false;
    // ジャンプを解除したら上方向テレポートの状態をリセット
    if (!player.isJumping) playerState.hasTeleportedUp = false;
}

/**
 * 下方向へのテレポート処理
 * @param {Object} player - プレイヤーオブジェクト
 * @param {Object} dimension - 次元オブジェクト
 * @param {Object} pos - プレイヤーの位置
 * @param {string} allowedBlock - 対象のブロックタイプ
 * @param {Object} playerState - プレイヤーの状態オブジェクト
 */
function handleDownTeleport(player, dimension, pos, allowedBlock, playerState) {
    // テレポート条件チェック
    if (!player.isSneaking || player.isJumping || playerState.hasTeleportedDown) return;

    // 探索用の変数を初期化
    let minDistance = Infinity;  // 最小距離
    let nearestBlock = null;     // 最も近いブロックの位置
    let foundBlock = false;      // ブロックが見つかったかどうか

    // 下方向に探索
    for (let y = -2; y >= -config.maximum; y--) {
        // 探索位置を設定
        const checkPos = { x: pos.x, y: pos.y + y, z: pos.z };
        // 最小高さ制限を超えたら探索を終了
        if (checkPos.y <= config.miniLimit) break;

        // ブロックを取得して検証
        const block = dimension.getBlock(checkPos);
        if (!block || block.typeId !== allowedBlock) continue;

        // 対象ブロックが見つかった場合の処理
        foundBlock = true;
        const distance = Math.abs(y);
        // より近いブロックが見つかった場合は更新
        if (distance < minDistance) {
            minDistance = distance;
            nearestBlock = checkPos;
        }
    }

    // テレポート実行
    if (foundBlock && nearestBlock) {
        // テレポート位置を調整（ブロックの中心に）
        nearestBlock.x += 0.5;
        nearestBlock.y += 1;
        nearestBlock.z += 0.5;
        // テレポート実行
        player.teleport(nearestBlock);
        // 状態を更新
        playerState.hasTeleportedDown = true;
    }
}

/**
 * 上方向へのテレポート処理
 * @param {Object} player - プレイヤーオブジェクト
 * @param {Object} dimension - 次元オブジェクト
 * @param {Object} pos - プレイヤーの位置
 * @param {string} allowedBlock - 対象のブロックタイプ
 * @param {Object} playerState - プレイヤーの状態オブジェクト
 * @param {string} dimensionName - 次元名
 */
function handleUpTeleport(player, dimension, pos, allowedBlock, playerState, dimensionName) {
    // テレポート条件チェック
    if (!player.isJumping || player.isSneaking || playerState.hasTeleportedUp) return;

    // 探索用の変数を初期化
    let minDistance = Infinity;  // 最小距離
    let nearestBlock = null;     // 最も近いブロックの位置
    let foundBlock = false;      // ブロックが見つかったかどうか

    // 上方向に探索
    for (let y = 1; y <= config.maximum; y++) {
        // 探索位置を設定
        const checkPos = { x: pos.x, y: pos.y + y, z: pos.z };
        
        // 次元に応じた最大高さ制限をチェック
        if ((dimensionName === "minecraft:overworld" && checkPos.y >= config.maxLimitOW) ||
            ((dimensionName === "minecraft:nether" || dimensionName === "minecraft:the_end") && checkPos.y >= config.maxLimitETC)) {
            break;
        }

        // ブロックを取得して検証
        const block = dimension.getBlock(checkPos);
        if (!block || block.typeId !== allowedBlock) continue;

        // 対象ブロックが見つかった場合の処理
        foundBlock = true;
        const distance = y;
        // より近いブロックが見つかった場合は更新
        if (distance < minDistance) {
            minDistance = distance;
            nearestBlock = checkPos;
        }
    }

    // テレポート実行
    if (foundBlock && nearestBlock) {
        // テレポート位置を調整（ブロックの中心に）
        nearestBlock.x += 0.5;
        nearestBlock.y += 1;
        nearestBlock.z += 0.5;
        // テレポート実行
        player.teleport(nearestBlock);
        // 状態を更新
        playerState.hasTeleportedUp = true;
    }
}

// メインループ
system.runInterval(() => {
    // 各次元を処理
    for (const dimensionName of config.dimensions) {
        const dimension = world.getDimension(dimensionName);

        // 各プレイヤーを処理
        for (const player of dimension.getPlayers()) {
            // 各ブロックタイプを処理
            for (const allowedBlock of allowedBlocks) {
                // プレイヤーの位置を取得（整数に変換）
                const pos = player.location;
                pos.x = Math.floor(pos.x);
                pos.y = Math.floor(pos.y);
                pos.z = Math.floor(pos.z);

                // プレイヤーの状態を取得・更新
                const playerState = getPlayerState(player.id);
                resetPlayerState(playerState, player);

                // プレイヤーの足元のブロックをチェック
                const belowPos = { x: pos.x, y: pos.y - 1, z: pos.z };
                const belowBlock = dimension.getBlock(belowPos);
                // 対象ブロックでない場合はスキップ
                if (!belowBlock || belowBlock.typeId !== allowedBlock) continue;

                // テレポート処理を実行
                handleDownTeleport(player, dimension, pos, allowedBlock, playerState);
                handleUpTeleport(player, dimension, pos, allowedBlock, playerState, dimensionName);
            }
        }
    }
});
