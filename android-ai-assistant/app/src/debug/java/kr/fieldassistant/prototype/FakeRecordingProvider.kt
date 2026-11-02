package kr.fieldassistant.prototype

import android.database.Cursor
import android.database.MatrixCursor
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract.Document
import android.provider.DocumentsProvider
import java.io.File

/** Test-only provider, never included in the distributed APK. */
class FakeRecordingProvider: DocumentsProvider() {
    private fun root()=File(requireNotNull(context).filesDir,"fake-recordings")
    private fun file()=File(root(),"fixture.wav")
    override fun onCreate(): Boolean { root().mkdirs();return true }
    private fun columns(projection: Array<out String>?)=projection ?: arrayOf(Document.COLUMN_DOCUMENT_ID,Document.COLUMN_MIME_TYPE,Document.COLUMN_DISPLAY_NAME,Document.COLUMN_LAST_MODIFIED,Document.COLUMN_FLAGS,Document.COLUMN_SIZE)
    private fun row(cursor: MatrixCursor,cols: Array<out String>,directory: Boolean) {
        val f=if(directory) root() else file();val row=cursor.newRow()
        for(col in cols) row.add(when(col) {
            Document.COLUMN_DOCUMENT_ID -> if(directory) "root" else "fixture.wav"
            Document.COLUMN_MIME_TYPE -> if(directory) Document.MIME_TYPE_DIR else "audio/wav"
            Document.COLUMN_DISPLAY_NAME -> if(directory) "시험 녹음 폴더" else "fixture.wav"
            Document.COLUMN_LAST_MODIFIED -> f.lastModified()
            Document.COLUMN_SIZE -> if(directory) 0L else f.length()
            Document.COLUMN_FLAGS -> 0
            else -> null
        })
    }
    override fun queryRoots(projection: Array<out String>?): Cursor = MatrixCursor(projection ?: arrayOf("root_id"))
    override fun queryDocument(documentId: String,projection: Array<out String>?): Cursor {
        val cols=columns(projection);val c=MatrixCursor(cols)
        if(documentId=="root") row(c,cols,true) else if(documentId=="fixture.wav" && file().exists()) row(c,cols,false)
        return c
    }
    override fun queryChildDocuments(parentDocumentId:String,projection:Array<out String>?,sortOrder:String?):Cursor {
        val cols=columns(projection);val c=MatrixCursor(cols)
        if(parentDocumentId=="root" && file().exists()) row(c,cols,false)
        return c
    }
    override fun isChildDocument(parentDocumentId:String,documentId:String):Boolean=parentDocumentId=="root" && documentId=="fixture.wav"
    override fun openDocument(documentId:String,mode:String,signal:android.os.CancellationSignal?):ParcelFileDescriptor {
        require(documentId=="fixture.wav");return ParcelFileDescriptor.open(file(),ParcelFileDescriptor.MODE_READ_ONLY)
    }
}
