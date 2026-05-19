import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import { randomBytes } from "crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Escrow } from "../target/types/escrow";

const commitment = "confirmed";
const MINT_DECIMALS = 6;

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;
  const connection = provider.connection;
  const payer = provider.wallet as NodeWallet;

  const confirmTx = async (signature: string) => {
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitment
    );
  };

  const airdrop = async (pubkey: PublicKey, sol = 5) => {
    const signature = await connection.requestAirdrop(
      pubkey,
      sol * anchor.web3.LAMPORTS_PER_SOL
    );
    await confirmTx(signature);
  };

  const randomSeed = () => new BN(randomBytes(8), "le");

  const deriveEscrow = (maker: PublicKey, seed: BN) => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        maker.toBuffer(),
        seed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
  };

  const ata = (mint: PublicKey, owner: PublicKey) => {
    return getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  };

  const tokenAmount = async (address: PublicKey) => {
    return (await getAccount(connection, address, commitment, TOKEN_PROGRAM_ID))
      .amount;
  };

  const expectMissing = async (address: PublicKey) => {
    const account = await connection.getAccountInfo(address, commitment);
    expect(account).to.equal(null);
  };

  const expectRejects = async (
    promise: Promise<unknown>,
    contains?: string
  ) => {
    try {
      await promise;
      expect.fail("Expected transaction to fail");
    } catch (err) {
      const message = String(err);
      if (contains) {
        expect(message).to.include(contains);
      }
    }
  };

  const createScenario = async ({
    makerAFunding = 1_000n,
    takerBFunding = 1_000n,
    deposit = 100n,
    receive = 40n,
  } = {}) => {
    const maker = Keypair.generate();
    const taker = Keypair.generate();
    await Promise.all([airdrop(maker.publicKey), airdrop(taker.publicKey)]);

    const mintA = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      MINT_DECIMALS,
      undefined,
      { commitment },
      TOKEN_PROGRAM_ID
    );
    const mintB = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      MINT_DECIMALS,
      undefined,
      { commitment },
      TOKEN_PROGRAM_ID
    );

    const makerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintA,
        maker.publicKey,
        false,
        commitment,
        { commitment },
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ).address;
    const makerAtaB = ata(mintB, maker.publicKey);
    const takerAtaA = ata(mintA, taker.publicKey);
    const takerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintB,
        taker.publicKey,
        false,
        commitment,
        { commitment },
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ).address;

    await mintTo(
      connection,
      payer.payer,
      mintA,
      makerAtaA,
      payer.payer,
      makerAFunding,
      [],
      { commitment },
      TOKEN_PROGRAM_ID
    );
    await mintTo(
      connection,
      payer.payer,
      mintB,
      takerAtaB,
      payer.payer,
      takerBFunding,
      [],
      { commitment },
      TOKEN_PROGRAM_ID
    );

    const seed = randomSeed();
    const escrow = deriveEscrow(maker.publicKey, seed);
    const vault = ata(mintA, escrow);

    return {
      maker,
      taker,
      mintA,
      mintB,
      makerAtaA,
      makerAtaB,
      takerAtaA,
      takerAtaB,
      seed,
      escrow,
      vault,
      deposit,
      receive,
    };
  };

  const make = async (s: Awaited<ReturnType<typeof createScenario>>) => {
    return program.methods
      .make(s.seed, new BN(s.receive.toString()), new BN(s.deposit.toString()))
      .accountsPartial({
        maker: s.maker.publicKey,
        mintA: s.mintA,
        mintB: s.mintB,
        makerAtaA: s.makerAtaA,
        escrow: s.escrow,
        vault: s.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([s.maker])
      .rpc({ commitment });
  };

  const take = async (
    s: Awaited<ReturnType<typeof createScenario>>,
    seed = s.seed
  ) => {
    return program.methods
      .take(seed)
      .accountsPartial({
        taker: s.taker.publicKey,
        maker: s.maker.publicKey,
        mintA: s.mintA,
        mintB: s.mintB,
        takerAtaA: s.takerAtaA,
        takerAtaB: s.takerAtaB,
        makerAtaB: s.makerAtaB,
        escrow: s.escrow,
        vault: s.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([s.taker])
      .rpc({ commitment });
  };

  const refund = async (
    s: Awaited<ReturnType<typeof createScenario>>,
    maker = s.maker,
    makerAtaA = s.makerAtaA
  ) => {
    return program.methods
      .refund()
      .accountsPartial({
        maker: maker.publicKey,
        mintA: s.mintA,
        makerAtaA,
        escrow: s.escrow,
        vault: s.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc({ commitment });
  };

  before(async () => {
    await airdrop(payer.publicKey);
  });

  it("makes an escrow and deposits maker token A into the vault", async () => {
    const s = await createScenario();

    await make(s);

    const escrowAccount = await program.account.escrow.fetch(s.escrow);
    expect(escrowAccount.seed.eq(s.seed)).to.equal(true);
    expect(escrowAccount.maker.equals(s.maker.publicKey)).to.equal(true);
    expect(escrowAccount.mintA.equals(s.mintA)).to.equal(true);
    expect(escrowAccount.mintB.equals(s.mintB)).to.equal(true);
    expect(escrowAccount.receive.eq(new BN(s.receive.toString()))).to.equal(
      true
    );

    expect(await tokenAmount(s.makerAtaA)).to.equal(900n);
    expect(await tokenAmount(s.vault)).to.equal(100n);
  });

  it("lets the taker accept the trade and closes escrow/vault", async () => {
    const s = await createScenario();
    await make(s);

    await take(s);

    expect(await tokenAmount(s.makerAtaA)).to.equal(900n);
    expect(await tokenAmount(s.makerAtaB)).to.equal(40n);
    expect(await tokenAmount(s.takerAtaA)).to.equal(100n);
    expect(await tokenAmount(s.takerAtaB)).to.equal(960n);
    await expectMissing(s.escrow);
    await expectMissing(s.vault);
  });

  it("lets the maker refund and closes escrow/vault", async () => {
    const s = await createScenario();
    await make(s);

    await refund(s);

    expect(await tokenAmount(s.makerAtaA)).to.equal(1_000n);
    await expectMissing(s.escrow);
    await expectMissing(s.vault);
  });

  it("rejects taking with the wrong seed", async () => {
    const s = await createScenario();
    await make(s);

    await expectRejects(take(s, s.seed.addn(1)));

    expect(await tokenAmount(s.vault)).to.equal(100n);
    expect(await tokenAmount(s.takerAtaB)).to.equal(1_000n);
  });

  it("rejects taking when the taker has insufficient token B", async () => {
    const s = await createScenario({ takerBFunding: 10n });
    await make(s);

    await expectRejects(take(s));

    expect(await tokenAmount(s.vault)).to.equal(100n);
    expect(await tokenAmount(s.takerAtaB)).to.equal(10n);
  });

  it("rejects refund from a signer that is not the maker", async () => {
    const s = await createScenario();
    const impostor = Keypair.generate();
    await airdrop(impostor.publicKey);
    const impostorAtaA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        s.mintA,
        impostor.publicKey,
        false,
        commitment,
        { commitment },
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ).address;
    await make(s);

    await expectRejects(refund(s, impostor, impostorAtaA));

    expect(await tokenAmount(s.vault)).to.equal(100n);
    expect(await tokenAmount(s.makerAtaA)).to.equal(900n);
  });

  it("rejects creating two escrows with the same maker and seed", async () => {
    const s = await createScenario();

    await make(s);
    await expectRejects(make(s));

    expect(await tokenAmount(s.vault)).to.equal(100n);
    expect(await tokenAmount(s.makerAtaA)).to.equal(900n);
  });
});
