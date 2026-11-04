import initSqlJs from "sql.js";
import { mkdir, writeFile } from "node:fs/promises";
const SQL = await initSqlJs();
const db = new SQL.Database();
db.run(
  "CREATE TABLE content(ContentID TEXT,ContentType TEXT,Title TEXT,Attribution TEXT,ReadStatus INT,___PercentRead REAL,TimeSpentReading INT,DateLastRead TEXT,ImageId TEXT)",
);
db.run(
  "INSERT INTO content VALUES('file:///mnt/onboard/The Quiet Atlas.epub','6','The Quiet Atlas','Alex Morgan',1,42,3600,'2026-10-01','atlas')",
);
db.run(
  "INSERT INTO content VALUES('file:///mnt/onboard/Small Observations.epub','6','Small Observations','Robin Lane',2,100,2400,'2026-09-25',NULL)",
);
db.run(
  "CREATE TABLE Bookmark(BookmarkID TEXT,VolumeID TEXT,Text TEXT,Annotation TEXT,Hidden INT,DateCreated TEXT)",
);
db.run(
  "INSERT INTO Bookmark VALUES('q1','file:///mnt/onboard/The Quiet Atlas.epub','Attention turns ordinary moments into a life.','Look closer on the walk home.',0,'2026-10-01')",
);
await mkdir("fixtures/generated", { recursive: true });
await writeFile("fixtures/generated/KoboReader.sqlite", db.export());
await writeFile(
  "fixtures/generated/metadata.epub.lua",
  'return { doc_path="/mnt/onboard/A Book of Days.epub", doc_props={title="A Book of Days",authors="Sam Chen"}, percent_finished=0.32, annotations={{text="每一天都有值得記住的事。",note="Notice something new.",pos0="/body/1",datetime="2026-10-02 10:00:00"}} }',
);
console.log("Synthetic fixtures generated. No real book content.");
// Store records deliberately remain in the source, exercising the default reading-shelf scope.
db.run("ALTER TABLE content ADD COLUMN Accessibility INTEGER DEFAULT 1");
db.run("ALTER TABLE content ADD COLUMN IsDownloaded TEXT DEFAULT 'true'");
db.run(
  "INSERT INTO content(ContentID,ContentType,Title,Attribution,ReadStatus,___PercentRead,Accessibility,IsDownloaded) VALUES('store-preview','6','Synthetic Store Preview','Sample Author',2,100,6,'true'),('catalog','6','Synthetic Catalog Item','Sample Author',0,0,-1,'false')",
);
await writeFile("fixtures/generated/KoboReader.sqlite", db.export());
const kobalt = new SQL.Database();
kobalt.run(
  "CREATE TABLE books(book TEXT,identity TEXT,fingerprint TEXT,title TEXT)",
);
kobalt.run(
  "INSERT INTO books VALUES('k1','file:///mnt/onboard/Stillness.epub','synthetic-fingerprint','A Moment of Stillness')",
);
kobalt.run(
  "CREATE TABLE entries(book TEXT,kind INTEGER,id TEXT,start TEXT,end TEXT,text TEXT,chapter TEXT,created TEXT,note TEXT)",
);
kobalt.run(
  "INSERT INTO entries VALUES('k1',1,'h1','/body/1','/body/2','Let a thought breathe.','Chapter 1','2026-10-01T12:00:00Z','Kobalt personal note.'),('k1',0,'b1','/body/3','','A place to return.','Chapter 2','2026-10-02T12:00:00Z','')",
);
kobalt.run(
  "CREATE TABLE book_state(identity TEXT,format INTEGER,payload TEXT)",
);
kobalt.run("INSERT INTO book_state VALUES(?,?,?)", [
  "file:///mnt/onboard/Stillness.epub",
  1,
  JSON.stringify({
    fingerprint: "synthetic-fingerprint",
    percent: 25,
    position: "/body/1",
  }),
]);
kobalt.run(
  "CREATE TABLE reading_sessions(id TEXT,book TEXT,identity TEXT,fingerprint TEXT,title TEXT,author TEXT,started INTEGER,observed INTEGER,active_ms INTEGER)",
);
kobalt.run(
  "INSERT INTO reading_sessions VALUES('s1','k1','file:///mnt/onboard/Stillness.epub','synthetic-fingerprint','A Moment of Stillness','Sam Chen',1790000000000,1790000060000,30000)",
);
await writeFile("fixtures/generated/kobalt.sqlite", kobalt.export());
